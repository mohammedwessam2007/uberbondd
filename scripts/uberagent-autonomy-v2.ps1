$ErrorActionPreference = "Continue"
[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12

$InstallRoot = Join-Path $env:LOCALAPPDATA "UberBondNode"
$TokenFile = Join-Path $InstallRoot "node.token"
$DisableFile = Join-Path $InstallRoot "uberagent.disabled"
$LogFile = Join-Path $InstallRoot "uberagent.log"
$Endpoint = "https://lslifasfebpjbtqmkitm.supabase.co/functions/v1/uberworm-node"
$NodeId = "hp-local"
$PollSeconds = 30
$ApprovedModels = @("qwen3:0.6b","qwen3:1.7b","qwen3:4b")
$script:RestartRequested = $false

function Write-LogLine {
  param([string]$Message)
  $line = "$(Get-Date -Format o) $Message"
  Add-Content -Path $LogFile -Value $line -ErrorAction SilentlyContinue
}

function Get-NodeToken {
  if (-not (Test-Path $TokenFile)) { throw "node-token-file-missing" }
  return (Get-Content -Raw -Path $TokenFile).Trim()
}

function Invoke-ControlPlane {
  param(
    [Parameter(Mandatory=$true)][string]$Op,
    [hashtable]$Body = @{}
  )
  $headers = @{
    "x-uberworm-node" = $NodeId
    "x-uberworm-token" = (Get-NodeToken)
  }
  $payload = @{ op = $Op }
  foreach ($key in $Body.Keys) { $payload[$key] = $Body[$key] }
  Invoke-RestMethod -Method Post -Uri $Endpoint -Headers $headers -ContentType "application/json" -Body ($payload | ConvertTo-Json -Depth 8) -TimeoutSec 15
}

function Get-HardwareInventory {
  try {
    $os = Get-WmiObject Win32_OperatingSystem | Select-Object -First 1
    $cpu = Get-WmiObject Win32_Processor | Select-Object -First 1
    $pc = Get-WmiObject Win32_ComputerSystem | Select-Object -First 1
    $gpus = @(Get-WmiObject Win32_VideoController)
    $disks = @(Get-WmiObject Win32_LogicalDisk | Where-Object { $_.DriveType -eq 3 })
    $battery = @(Get-WmiObject Win32_Battery -ErrorAction SilentlyContinue)

    $ramGb = if ($pc.TotalPhysicalMemory) { [math]::Round([double]$pc.TotalPhysicalMemory / 1GB, 2) } else { $null }
    $freeRamGb = if ($os.FreePhysicalMemory) { [math]::Round(([double]$os.FreePhysicalMemory * 1KB) / 1GB, 2) } else { $null }
    $candidate = if ($ramGb -lt 6) { "qwen3:0.6b" } elseif ($ramGb -lt 10) { "qwen3:1.7b" } elseif ($ramGb -lt 16) { "qwen3:4b" } else { "qwen3:8b" }

    return @{
      ok = $true
      host = @{
        computerName = $env:COMPUTERNAME
        manufacturer = $pc.Manufacturer
        model = $pc.Model
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
      memory = @{ totalRamGB = $ramGb; freeRamGB = $freeRamGb }
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
      battery = @($battery | ForEach-Object { @{
        name = $_.Name
        estimatedChargeRemaining = $_.EstimatedChargeRemaining
        batteryStatus = $_.BatteryStatus
      }})
      candidate = @{ smokeTestModel = $candidate }
      safety = @{
        requiresAdministrator = $false
        mainsInteraction = "NONE"
        changesPowerPlan = $false
        changesFirmware = $false
      }
    }
  } catch {
    return @{ ok=$false; error="inventory-failed"; detail=$_.Exception.Message }
  }
}

function Get-OllamaState {
  try {
    $tags = Invoke-RestMethod -Method Get -Uri "http://127.0.0.1:11434/api/tags" -TimeoutSec 3
    return @{
      ok=$true
      installedAndReachable=$true
      models=@($tags.models | ForEach-Object { @{ name=$_.name; size=$_.size; digest=$_.digest } })
    }
  } catch {
    return @{ ok=$false; installedAndReachable=$false; error="ollama-not-reachable" }
  }
}

function Install-OllamaOfficial {
  try {
    $existing = Get-OllamaState
    if ($existing.ok) {
      return @{ ok=$true; alreadyInstalled=$true; installedAndReachable=$true }
    }

    $url = "https://ollama.com/download/OllamaSetup.exe"
    $tempInstaller = Join-Path $env:TEMP "OllamaSetup.exe"
    if (Test-Path $tempInstaller) { Remove-Item $tempInstaller -Force -ErrorAction SilentlyContinue }

    $wc = New-Object Net.WebClient
    $wc.DownloadFile($url, $tempInstaller)

    $sig = Get-AuthenticodeSignature -FilePath $tempInstaller
    $subject = if ($sig.SignerCertificate) { $sig.SignerCertificate.Subject } else { "" }
    if ($sig.Status -ne "Valid" -or $subject -notmatch "(^|, )O=Ollama Inc\.(,|$)") {
      Remove-Item $tempInstaller -Force -ErrorAction SilentlyContinue
      return @{ ok=$false; error="ollama-installer-signature-rejected"; signatureStatus=[string]$sig.Status; signer=$subject }
    }

    $args = "/VERYSILENT /NORESTART /SUPPRESSMSGBOXES"
    $proc = Start-Process -FilePath $tempInstaller -ArgumentList $args -PassThru
    $proc.WaitForExit()
    $exitCode = $proc.ExitCode
    Remove-Item $tempInstaller -Force -ErrorAction SilentlyContinue

    if ($exitCode -ne 0) {
      return @{ ok=$false; error="ollama-installer-failed"; exitCode=$exitCode }
    }

    $ollamaDir = Join-Path $env:LOCALAPPDATA "Programs\Ollama"
    if (Test-Path $ollamaDir) {
      $env:PATH = "$ollamaDir;$env:PATH"
    }

    for ($i=0; $i -lt 15; $i++) {
      Start-Sleep -Seconds 2
      $state = Get-OllamaState
      if ($state.ok) {
        return @{ ok=$true; installed=$true; installedAndReachable=$true; signer=$subject }
      }
    }

    return @{ ok=$true; installed=$true; installedAndReachable=$false; warning="installed-but-api-not-yet-reachable" }
  } catch {
    return @{ ok=$false; error="ollama-install-exception"; detail=$_.Exception.Message }
  }
}

function Update-UberAgent {
  param([hashtable]$CommandArgs)

  $commit = [string]$CommandArgs.commit
  $expectedSha256 = ([string]$CommandArgs.sha256).ToLowerInvariant()

  if ($commit -notmatch "^[0-9a-f]{40}$") {
    return @{ ok=$false; error="valid-commit-required" }
  }
  if ($expectedSha256 -notmatch "^[0-9a-f]{64}$") {
    return @{ ok=$false; error="valid-sha256-required" }
  }

  try {
    $url = "https://raw.githubusercontent.com/mohammedwessam2007/uberbondd/$commit/scripts/uberagent-legacy.ps1"
    $temp = Join-Path $env:TEMP "uberagent-update.ps1"
    $wc = New-Object Net.WebClient
    $wc.DownloadFile($url, $temp)

    $actual = (Get-FileHash -Algorithm SHA256 -Path $temp).Hash.ToLowerInvariant()
    if ($actual -ne $expectedSha256) {
      Remove-Item $temp -Force -ErrorAction SilentlyContinue
      return @{ ok=$false; error="agent-update-hash-mismatch"; expected=$expectedSha256; actual=$actual }
    }

    $target = Join-Path $InstallRoot "UberAgent.ps1"
    Copy-Item -Force $temp $target
    Remove-Item $temp -Force -ErrorAction SilentlyContinue
    $script:RestartRequested = $true

    return @{ ok=$true; updated=$true; commit=$commit; sha256=$actual; restartRequired=$true }
  } catch {
    return @{ ok=$false; error="agent-update-exception"; detail=$_.Exception.Message }
  }
}

function Pull-ApprovedModel {
  param([hashtable]$CommandArgs)
  $model = [string]$CommandArgs.model
  if ($ApprovedModels -notcontains $model) { return @{ ok=$false; error="model-not-approved" } }
  if (-not (Get-Command ollama -ErrorAction SilentlyContinue)) { return @{ ok=$false; error="ollama-not-installed" } }
  try {
    $out = & ollama pull $model 2>&1 | Out-String
    return @{ ok=($LASTEXITCODE -eq 0); model=$model; output=$out.Substring([Math]::Max(0,$out.Length-3000)) }
  } catch {
    return @{ ok=$false; error="ollama-pull-failed"; detail=$_.Exception.Message }
  }
}

function Invoke-LocalPrompt {
  param([hashtable]$CommandArgs)
  $model = [string]$CommandArgs.model
  $prompt = [string]$CommandArgs.prompt
  if ($ApprovedModels -notcontains $model) { return @{ ok=$false; error="model-not-approved" } }
  if ([string]::IsNullOrWhiteSpace($prompt)) { return @{ ok=$false; error="prompt-required" } }
  if ($prompt.Length -gt 2000) { $prompt = $prompt.Substring(0,2000) }
  $numPredict = 128
  if ($CommandArgs.ContainsKey("numPredict")) { $numPredict = [math]::Max(16,[math]::Min(256,[int]$CommandArgs.numPredict)) }
  try {
    $body = @{
      model=$model
      prompt=$prompt
      stream=$false
      options=@{ temperature=0; num_predict=$numPredict }
    } | ConvertTo-Json -Depth 6
    $r = Invoke-RestMethod -Method Post -Uri "http://127.0.0.1:11434/api/generate" -ContentType "application/json" -Body $body -TimeoutSec 600
    $text = [string]$r.response
    return @{
      ok=$true
      model=$model
      response=$text.Substring(0,[math]::Min(8000,$text.Length))
      outputTokens=[int64]$r.eval_count
      promptTokens=[int64]$r.prompt_eval_count
      evalDurationNs=[int64]$r.eval_duration
      totalDurationNs=[int64]$r.total_duration
    }
  } catch {
    return @{ ok=$false; error="local-prompt-failed"; detail=$_.Exception.Message }
  }
}

function Invoke-BoundedBenchmark {
  param([hashtable]$CommandArgs)
  $model = [string]$CommandArgs.model
  if ($ApprovedModels -notcontains $model) { return @{ ok=$false; error="model-not-approved" } }
  $runs = 3
  if ($CommandArgs.ContainsKey("runs")) { $runs = [math]::Max(1,[math]::Min(3,[int]$CommandArgs.runs)) }
  $numPredict = 256
  if ($CommandArgs.ContainsKey("numPredict")) { $numPredict = [math]::Max(64,[math]::Min(256,[int]$CommandArgs.numPredict)) }
  try {
    $prompt = "Explain compactly how a home energy ledger can schedule local AI jobs. Continue until the generation limit."
    $body = @{ model=$model; prompt=$prompt; stream=$false; options=@{temperature=0;num_predict=$numPredict} } | ConvertTo-Json -Depth 6
    $null = Invoke-RestMethod -Method Post -Uri "http://127.0.0.1:11434/api/generate" -ContentType "application/json" -Body $body -TimeoutSec 600
    [int64]$outTokens=0
    [int64]$promptTokens=0
    [int64]$evalNs=0
    [int64]$totalNs=0
    for ($i=1; $i -le $runs; $i++) {
      $r = Invoke-RestMethod -Method Post -Uri "http://127.0.0.1:11434/api/generate" -ContentType "application/json" -Body $body -TimeoutSec 900
      $outTokens += [int64]$r.eval_count
      $promptTokens += [int64]$r.prompt_eval_count
      $evalNs += [int64]$r.eval_duration
      $totalNs += [int64]$r.total_duration
    }
    $seconds = $evalNs / 1e9
    return @{
      ok=$true
      model=$model
      runs=$runs
      outputTokens=$outTokens
      promptTokens=$promptTokens
      durationSeconds=[math]::Round($totalNs/1e9,3)
      outputTokensPerSecond=if($seconds -gt 0){[math]::Round($outTokens/$seconds,3)}else{$null}
      measuredEnergyKwh=$null
      measuredOutputTokensPerKwh=$null
      truthBoundary="Runtime tokens measured. Energy efficiency remains unmeasured without an external kWh reading."
    }
  } catch {
    return @{ ok=$false; error="benchmark-failed"; detail=$_.Exception.Message }
  }
}

function Execute-Command {
  param($Command)
  $action = [string]$Command.action
  $commandArgs = @{}
  if ($Command.args) {
    foreach ($p in $Command.args.PSObject.Properties) { $commandArgs[$p.Name] = $p.Value }
  }
  switch ($action) {
    "ping" { return @{ ok=$true; pong=$true; host=$env:COMPUTERNAME; agent="uberagent-legacy-ps-v1"; at=(Get-Date).ToUniversalTime().ToString("o") } }
    "inventory" { return Get-HardwareInventory }
    "ollama_status" { return Get-OllamaState }
    "install_ollama" { return Install-OllamaOfficial }
    "self_update_agent" { return Update-UberAgent -CommandArgs $commandArgs }
    "pull_model" { return Pull-ApprovedModel -CommandArgs $commandArgs }
    "local_prompt" { return Invoke-LocalPrompt -CommandArgs $commandArgs }
    "benchmark" { return Invoke-BoundedBenchmark -CommandArgs $commandArgs }
    "repo_status" { return @{ ok=$false; error="git-not-required-on-legacy-node" } }
    "repo_sync_main" { return @{ ok=$false; error="git-not-required-on-legacy-node" } }
    "disable_agent" {
      New-Item -ItemType File -Force -Path $DisableFile | Out-Null
      return @{ ok=$true; disabled=$true }
    }
    default { return @{ ok=$false; error="action-not-implemented" } }
  }
}

Write-LogLine "UberAgent legacy-compatible node starting."

while ($true) {
  if (Test-Path $DisableFile) { Write-LogLine "Local disable marker found."; break }
  try {
    $poll = Invoke-ControlPlane -Op "poll"
    $command = $poll.command
    if ($null -ne $command) {
      try { $result = Execute-Command -Command $command }
      catch { $result = @{ ok=$false; error="execution-exception"; detail=$_.Exception.Message } }

      Invoke-ControlPlane -Op "receipt" -Body @{
        commandId=[string]$command.id
        ok=[bool]$result.ok
        payload=$result
      } | Out-Null

      Write-LogLine "Completed $($command.action) ok=$([bool]$result.ok)"
      if ($script:RestartRequested -and [bool]$result.ok) {
        $target = Join-Path $InstallRoot "UberAgent.ps1"
        Start-Process powershell.exe -WindowStyle Hidden -ArgumentList @("-NoLogo","-NoProfile","-ExecutionPolicy","Bypass","-File",$target)
        break
      }
      if ([string]$command.action -eq "disable_agent" -and [bool]$result.ok) { break }
    }
  } catch {
    Write-LogLine "cycle-error $($_.Exception.Message)"
  }
  Start-Sleep -Seconds $PollSeconds
}

Write-LogLine "UberAgent stopped."
