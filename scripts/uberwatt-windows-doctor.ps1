param(
  [string]$OutputPath = ".\uberwatt-hardware-report.json"
)

$ErrorActionPreference = "Stop"

function Safe-GetCimInstance {
  param([string]$ClassName)
  try { return Get-CimInstance -ClassName $ClassName } catch { return @() }
}

$os = Safe-GetCimInstance Win32_OperatingSystem | Select-Object -First 1
$cpu = Safe-GetCimInstance Win32_Processor | Select-Object -First 1
$gpus = @(Safe-GetCimInstance Win32_VideoController)
$computer = Safe-GetCimInstance Win32_ComputerSystem | Select-Object -First 1
$disks = @(Safe-GetCimInstance Win32_LogicalDisk | Where-Object { $_.DriveType -eq 3 })
$batteries = @(Safe-GetCimInstance Win32_Battery)

$totalRamBytes = if ($computer.TotalPhysicalMemory) { [double]$computer.TotalPhysicalMemory } else { 0 }
$totalRamGb = [math]::Round($totalRamBytes / 1GB, 2)
$freeRamGb = if ($os.FreePhysicalMemory) { [math]::Round(([double]$os.FreePhysicalMemory * 1KB) / 1GB, 2) } else { $null }

$ollamaCommand = Get-Command ollama -ErrorAction SilentlyContinue
$ollamaInstalled = $null -ne $ollamaCommand
$ollamaVersion = $null
$ollamaReachable = $false
$installedModels = @()

if ($ollamaInstalled) {
  try { $ollamaVersion = (& ollama --version 2>&1 | Out-String).Trim() } catch {}
  try {
    $tags = Invoke-RestMethod -Method Get -Uri "http://127.0.0.1:11434/api/tags" -TimeoutSec 3
    $ollamaReachable = $true
    $installedModels = @($tags.models | ForEach-Object { $_.name })
  } catch {}
}

$smokeModel = if ($totalRamGb -lt 6) {
  "qwen3:0.6b"
} elseif ($totalRamGb -lt 10) {
  "qwen3:1.7b"
} elseif ($totalRamGb -lt 16) {
  "qwen3:4b"
} else {
  "qwen3:8b"
}

$gptOss20bMemoryEligible = $totalRamGb -ge 16

$report = [ordered]@{
  schemaVersion = "uberbond.uberwatt.windows-node.v0.1"
  generatedAt = (Get-Date).ToUniversalTime().ToString("o")
  host = [ordered]@{
    computerName = $env:COMPUTERNAME
    manufacturer = $computer.Manufacturer
    model = $computer.Model
    windowsCaption = $os.Caption
    windowsVersion = $os.Version
    windowsBuild = $os.BuildNumber
    architecture = $os.OSArchitecture
  }
  cpu = [ordered]@{
    name = $cpu.Name
    cores = $cpu.NumberOfCores
    logicalProcessors = $cpu.NumberOfLogicalProcessors
    maxClockMHz = $cpu.MaxClockSpeed
  }
  memory = [ordered]@{
    totalRamGB = $totalRamGb
    freeRamGB = $freeRamGb
  }
  graphics = @($gpus | ForEach-Object {
    [ordered]@{
      name = $_.Name
      adapterRamBytes = $_.AdapterRAM
      driverVersion = $_.DriverVersion
      status = $_.Status
    }
  })
  disks = @($disks | ForEach-Object {
    [ordered]@{
      drive = $_.DeviceID
      sizeGB = [math]::Round(([double]$_.Size) / 1GB, 2)
      freeGB = [math]::Round(([double]$_.FreeSpace) / 1GB, 2)
    }
  })
  battery = @($batteries | ForEach-Object {
    [ordered]@{
      name = $_.Name
      estimatedChargeRemaining = $_.EstimatedChargeRemaining
      batteryStatus = $_.BatteryStatus
    }
  })
  ollama = [ordered]@{
    installed = $ollamaInstalled
    reachable = $ollamaReachable
    version = $ollamaVersion
    installedModels = $installedModels
  }
  candidate = [ordered]@{
    smokeTestModel = $smokeModel
    gptOss20bMemoryEligible = $gptOss20bMemoryEligible
    warning = "Memory eligibility is not a performance guarantee. UberWatt benchmarks real throughput before promoting any model."
  }
  safety = [ordered]@{
    changedSystemSettings = $false
    changedPowerPlan = $false
    requiresAdministrator = $false
    mainsInteraction = "NONE"
    note = "This doctor is read-only. It does not alter Windows, power limits, fan curves, firmware, or electrical hardware."
  }
}

$report | ConvertTo-Json -Depth 8 | Set-Content -Encoding UTF8 $OutputPath
$report | ConvertTo-Json -Depth 8
Write-Host ""
Write-Host "UberWatt doctor finished. Report saved to $OutputPath"
if (-not $ollamaInstalled) {
  Write-Host "Ollama is not installed. Use the official Windows installer from https://ollama.com/download/windows"
} elseif (-not $ollamaReachable) {
  Write-Host "Ollama is installed but its local API is not reachable yet. Open Ollama, then rerun this doctor."
} else {
  Write-Host "Suggested first smoke-test model: $smokeModel"
}
