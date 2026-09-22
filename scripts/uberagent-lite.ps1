$ErrorActionPreference = "Stop"

$InstallRoot = Join-Path $env:LOCALAPPDATA "UberBondNode"
$Cache = Join-Path $InstallRoot ".cache"
$TokenFile = Join-Path $InstallRoot "uberworm-token.dpapi"
$DisableFile = Join-Path $InstallRoot "uberworm-disabled"
$LogFile = Join-Path $Cache "uberagent-lite.log"
$Endpoint = "https://lslifasfebpjbtqmkitm.supabase.co/functions/v1/uberworm-node"
$NodeId = "hp-local"
$PollSeconds = 30
$ApprovedModels = @("qwen3:0.6b","qwen3:1.7b","qwen3:4b")

New-Item -ItemType Directory -Force -Path $Cache | Out-Null

function Write-UberLog {
  param([string]$Message)
  $line = "$(Get-Date -Format o) $Message"
  Write-Host $line
  Add-Content -Path $LogFile -Value $line -ErrorAction SilentlyContinue
}

function Get-NodeToken {
  if (-not (Test-Path $TokenFile)) { throw "node-token-file-missing" }
  $encoded = (Get-Content -Raw -Path $TokenFile).Trim()
  $protected = [Convert]::FromBase64String($encoded)
  $plain = [Security.Cryptography.ProtectedData]::Unprotect(
    $protected,
    $null,
    [Security.Cryptography.DataProtectionScope]::CurrentUser
  )
  return [Text.Encoding]::UTF8.GetString($plain)
}

function Invoke-UberApi {
  param(
    [Parameter(Mandatory=$true)][string]$Op,
    [hashtable]$Body = @{}
  )
  $token = Get-NodeToken
  $headers = @{
    "x-uberworm-node" = $NodeId
    "x-uberworm-token" = $token
  }
  $payload = @{ op = $Op }
  foreach ($k in $Body.Keys) { $payload[$k] = $Body[$k] }
  return Invoke-RestMethod -Method Post -Uri $Endpoint -Headers $headers -ContentType "application/json" -Body ($payload | ConvertTo-Json -Depth 8) -TimeoutSec 15
}

function Get-Inventory {
  try {
    $os = Get-CimInstance Win32_OperatingSystem | Select-Object -First 1
    $cpu = Get-CimInstance Win32_Processor | Select-Object -First 1
    $computer = Get-CimInstance Win32_ComputerSystem | Select-Object -First 1
    $gpus = @(Get-CimInstance Win32_VideoController)
    $disks = @(Get-CimInstance Win32_LogicalDisk | Where-Object DriveType -eq 3)
    $batteries = @(Get-CimInstance Win32_Battery -ErrorAction SilentlyContinue)

    $totalRamGb = if ($computer.TotalPhysicalMemory) { [math]::Round([double]$computer.TotalPhysicalMemory / 1GB, 2) } else { $null }
    $freeRamGb = if ($os.FreePhysicalMemory) { [math]::Round(([double]$os.FreePhysicalMemory * 1KB) / 1GB, 2) } else { $null }

    $suggested = if ($totalRamGb -lt 6) { "qwen3:0.6b" }
      elseif ($totalRamGb -lt 10) { "qwen3:1.7b" }
      elseif ($totalRamGb -lt 16) { "qwen3:4b" }
      else { "qwen3:8b" }

    return @{
      ok = $true
      host = @{
        computerName = $env:COMPUTERNAME
        manufacturer = $computer.Manufacturer
        model = $computer.Model
        windowsCaption = $os.Caption
        windowsVersion = $os.Version
        windowsBuild = $os.BuildNumber
        architecture = $os.OSArchitecture
      }
      cpu = @{
        name = $cpu.Name
        cores = $cpu.NumberOfCores
        logicalProcessors = $cpu.NumberOfLogicalProcessors
        maxClockMHz = $cpu.MaxClockSpeed
      }
      memory = @{ totalRamGB = $totalRamGb; freeRamGB = $freeRamGb }
      graphics = @($gpus | ForEach-Object { @{
        name = $_.Name
        adapterRamBytes = $_.AdapterRAM
        driverVersion = $_.DriverVersion
        status = $_.Status
      }})
      disks = @($disks | ForEach-Object { @{
        drive = $_.DeviceID
        sizeGB = [math]::Round([double]$_.Size / 1GB, 2)
        freeGB = [math]::Round([double]$_.FreeSpace / 1GB, 2)
      }})
      battery = @($batteries | ForEach-Object { @{
        name = $_.Name
        estimatedChargeRemaining = $_.EstimatedChargeRemaining
        batteryStatus = $_.BatteryStatus
      }})
      candidate = @{
        smokeTestModel = $suggested
        warning = "Starting point only. Promote models only after measured runtime benchmark."
      }
      safety = @{
        requiresAdministrator = $false
        mainsInteraction = "NONE"
        changesPowerPlan = $false
        changesFirmware = $false
      }
    }
  } catch {
    return @{ ok = $false; error = "inventory-failed"; detail = $_.Exception.Message }
  }
}

function Get-OllamaStatus {
  try {
    $tags = Invoke-RestMethod -Method Get -Uri "http://127.0.0.1:11434/api/tags" -TimeoutSec 3
    return @{
      ok = $true
      installedAndReachable = $true
      models = @($tags.models | ForEach-Object { @{ name=$_.name; size=$_.size; digest=$_.digest } })
    }
  } catch {
    return @{ ok = $false; installedAndReachable = $false; error = "ollama-not-reachable" }
  }
}

function Pull-OllamaModel {
  param([hashtable]$Args)
  $model = [string]$Args.model
  if ($ApprovedModels -notcontains $model) {
    return @{ ok=$false; error="model-not-approved"; approvedModels=$ApprovedModels }
  }
  $ollama = Get-Command ollama -ErrorAction SilentlyContinue
  if (-not $ollama) { return @{ ok=$false; error="ollama-command-not-installed" } }
  try {
    $output = & ollama pull $model 2>&1 | Out-String
    return @{ ok=($LASTEXITCODE -eq 0); model=$model; output=$output.Substring([Math]::Max(0,$output.Length-4000)) }
  } catch {
    return @{ ok=$false; error="ollama-pull-failed"; detail=$_.Exception.Message }
  }
}

function Invoke-LocalPrompt {
  param([hashtable]$Args)
  $model = [string]$Args.model
  $prompt = [string]$Args.prompt
  $numPredict = 128
  if ($Args.ContainsKey("numPredict")) { $numPredict = [int]$Args.numPredict }
  $numPredict = [Math]::Max(16,[Math]::Min(256,$numPredict))
  if ($ApprovedModels -notcontains $model) { return @{ ok=$false; error="model-not-approved" } }
  if ([string]::IsNullOrWhiteSpace($prompt)) { return @{ ok=$false; error="prompt-required" } }
  if ($prompt.Length -gt 2000) { $prompt = $prompt.Substring(0,2000) }
  try {
    $body = @{
      model = $model
      prompt = $prompt
      stream = $false
      options = @{ temperature=0; num_predict=$numPredict }
    } | ConvertTo-Json -Depth 6
    $response = Invoke-RestMethod -Method Post -Uri "http://127.0.0.1:11434/api/generate" -ContentType "application/json" -Body $body -TimeoutSec 600
    $text = [string]$response.response
    return @{
      ok=$true
      model=$model
      response=$text.Substring(0,[Math]::Min(8000,$text.Length))
      outputTokens=[int64]$response.eval_count
      promptTokens=[int64]$response.prompt_eval_count
      evalDurationNs=[int64]$response.eval_duration
      totalDurationNs=[int64]$response.total_duration
    }
  } catch {
    return @{ ok=$false; error="local-prompt-failed"; detail=$_.Exception.Message }
  }
}

function Invoke-Benchmark {
  param([hashtable]$Args)
  $model = [string]$Args.model
  if ($ApprovedModels -notcontains $model) { return @{ ok=$false; error="model-not-approved" } }
  $runs = 3
  if ($Args.ContainsKey("runs")) { $runs = [Math]::Max(1,[Math]::Min(3,[int]$Args.runs)) }
  $numPredict = 256
  if ($Args.ContainsKey("numPredict")) { $numPredict = [Math]::Max(64,[Math]::Min(256,[int]$Args.numPredict)) }

  try {
    $prompt = "Explain in compact technical prose how a home energy ledger can schedule local AI jobs. Continue until the generation limit is reached."
    $bodyObj = @{ model=$model; prompt=$prompt; stream=$false; options=@{temperature=0;num_predict=$numPredict} }
    $body = $bodyObj | ConvertTo-Json -Depth 6
    $null = Invoke-RestMethod -Method Post -Uri "http://127.0.0.1:11434/api/generate" -ContentType "application/json" -Body $body -TimeoutSec 600

    [int64]$outputTokens = 0
    [int64]$promptTokens = 0
    [int64]$evalNs = 0
    [int64]$durationNs = 0
    for ($i=1; $i -le $runs; $i++) {
      $r = Invoke-RestMethod -Method Post -Uri "http://127.0.0.1:11434/api/generate" -ContentType "application/json" -Body $body -TimeoutSec 900
      $outputTokens += [int64]$r.eval_count
      $promptTokens += [int64]$r.prompt_eval_count
      $evalNs += [int64]$r.eval_duration
      $durationNs += [int64]$r.total_duration
    }
    $evalSeconds = $evalNs / 1e9
    return @{
      ok=$true
      model=$model
      runs=$runs
      outputTokens=$outputTokens
      promptTokens=$promptTokens
      durationSeconds=[math]::Round($durationNs/1e9,3)
      outputTokensPerSecond=if($evalSeconds -gt 0){[math]::Round($outputTokens/$evalSeconds,3)}else{$null}
      measuredEnergyKwh=$null
      measuredOutputTokensPerKwh=$null
      truthBoundary="Runtime tokens measured by Ollama. Energy efficiency is not measured without an external kWh measurement."
    }
  } catch {
    return @{ ok=$false; error="benchmark-failed"; detail=$_.Exception.Message }
  }
}

function Execute-Command {
  param($Command)
  $action = [string]$Command.action
  $args = @{}
  if ($Command.args) {
    foreach ($p in $Command.args.PSObject.Properties) { $args[$p.Name] = $p.Value }
  }

  switch ($action) {
    "ping" { return @{ ok=$true; pong=$true; host=$env:COMPUTERNAME; at=(Get-Date).ToUniversalTime().ToString("o"); agent="uberagent-lite-powershell-v1" } }
    "inventory" { return Get-Inventory }
    "ollama_status" { return Get-OllamaStatus }
    "pull_model" { return Pull-OllamaModel -Args $args }
    "benchmark" { return Invoke-Benchmark -Args $args }
    "local_prompt" { return Invoke-LocalPrompt -Args $args }
    "repo_status" { return @{ ok=$false; error="not-supported-in-zero-dependency-agent"; note="Git intentionally not required." } }
    "repo_sync_main" { return @{ ok=$false; error="not-supported-in-zero-dependency-agent"; note="Git intentionally not required." } }
    "disable_agent" {
      New-Item -ItemType File -Force -Path $DisableFile | Out-Null
      return @{ ok=$true; disabled=$true }
    }
    default { return @{ ok=$false; error="action-not-implemented-in-lite-agent" } }
  }
}

Write-UberLog "UberAgent Lite starting. Zero-dependency PowerShell mode."

while ($true) {
  if (Test-Path $DisableFile) {
    Write-UberLog "Local disable marker found. Stopping."
    break
  }

  try {
    $poll = Invoke-UberApi -Op "poll"
    $command = $poll.command

    if ($null -ne $command) {
      $expires = [datetimeoffset]::Parse([string]$command.expires_at)
      if ($expires -le [datetimeoffset]::UtcNow) {
        Invoke-UberApi -Op "receipt" -Body @{
          commandId = [string]$command.id
          ok = $false
          payload = @{ error="command-expired-locally" }
        } | Out-Null
      } else {
        Write-UberLog "Running $($command.id) $($command.action)"
        try {
          $result = Execute-Command -Command $command
        } catch {
          $result = @{ ok=$false; error="execution-exception"; detail=$_.Exception.Message }
        }

        Invoke-UberApi -Op "receipt" -Body @{
          commandId = [string]$command.id
          ok = [bool]$result.ok
          payload = $result
        } | Out-Null

        Write-UberLog "Finished $($command.id) ok=$([bool]$result.ok)"
        if ([string]$command.action -eq "disable_agent" -and [bool]$result.ok) { break }
      }
    }
  } catch {
    Write-UberLog "cycle-error $($_.Exception.Message)"
  }

  Start-Sleep -Seconds $PollSeconds
}

Write-UberLog "UberAgent Lite stopped."
