param(
  [Parameter(Mandatory=$true)]
  [string]$Model,

  [int]$Runs = 3,
  [int]$NumPredict = 256,

  [Nullable[double]]$MeasuredEnergyKwh = $null,
  [Nullable[double]]$PeakWallWatts = $null,
  [Nullable[double]]$PeakHardwareTempC = $null,

  [string]$SourceRef = "manual:ollama-runtime-counter",
  [string]$OutputPath = ".\uberwatt-local-benchmark.json"
)

$ErrorActionPreference = "Stop"

if ($Runs -lt 1 -or $Runs -gt 20) { throw "Runs must be between 1 and 20." }
if ($NumPredict -lt 32 -or $NumPredict -gt 4096) { throw "NumPredict must be between 32 and 4096." }

try {
  $null = Invoke-RestMethod -Method Get -Uri "http://127.0.0.1:11434/api/tags" -TimeoutSec 5
} catch {
  throw "Ollama local API is not reachable at 127.0.0.1:11434. Start Ollama first."
}

$prompt = @"
You are benchmarking local inference throughput. Produce a compact technical explanation of how a home energy ledger can schedule local AI jobs. Stay factual, avoid headings, and continue until the generation limit is reached.
"@

$body = @{
  model = $Model
  prompt = $prompt
  stream = $false
  options = @{
    temperature = 0
    num_predict = $NumPredict
  }
} | ConvertTo-Json -Depth 6

# Warm-up. This is intentionally excluded from the measured token counters.
$null = Invoke-RestMethod -Method Post -Uri "http://127.0.0.1:11434/api/generate" -ContentType "application/json" -Body $body -TimeoutSec 600

$results = @()
$totalOutputTokens = 0
$totalPromptTokens = 0
$totalEvalNs = 0
$totalPromptEvalNs = 0
$totalDurationNs = 0

for ($i = 1; $i -le $Runs; $i++) {
  $response = Invoke-RestMethod -Method Post -Uri "http://127.0.0.1:11434/api/generate" -ContentType "application/json" -Body $body -TimeoutSec 1800

  $outputTokens = [int64]$response.eval_count
  $promptTokens = [int64]$response.prompt_eval_count
  $evalNs = [int64]$response.eval_duration
  $promptEvalNs = [int64]$response.prompt_eval_duration
  $durationNs = [int64]$response.total_duration

  $totalOutputTokens += $outputTokens
  $totalPromptTokens += $promptTokens
  $totalEvalNs += $evalNs
  $totalPromptEvalNs += $promptEvalNs
  $totalDurationNs += $durationNs

  $results += [ordered]@{
    run = $i
    outputTokens = $outputTokens
    promptTokens = $promptTokens
    outputTokensPerSecond = if ($evalNs -gt 0) { [math]::Round($outputTokens / ($evalNs / 1e9), 3) } else { $null }
    totalSeconds = [math]::Round($durationNs / 1e9, 3)
  }
}

$totalSeconds = $totalDurationNs / 1e9
$outputEvalSeconds = $totalEvalNs / 1e9
$measuredTokensPerKwh = $null
$joulesPerOutputToken = $null

if ($MeasuredEnergyKwh.HasValue -and $MeasuredEnergyKwh.Value -gt 0 -and $totalOutputTokens -gt 0) {
  $measuredTokensPerKwh = [math]::Round($totalOutputTokens / $MeasuredEnergyKwh.Value, 3)
  $joulesPerOutputToken = [math]::Round(($MeasuredEnergyKwh.Value * 3600000) / $totalOutputTokens, 6)
}

$report = [ordered]@{
  schemaVersion = "uberbond.uberwatt.ollama-benchmark.v0.1"
  generatedAt = (Get-Date).ToUniversalTime().ToString("o")
  model = $Model
  runs = $Runs
  numPredict = $NumPredict
  outputTokens = $totalOutputTokens
  promptTokens = $totalPromptTokens
  totalTokens = $totalOutputTokens + $totalPromptTokens
  durationSeconds = [math]::Round($totalSeconds, 3)
  outputEvalSeconds = [math]::Round($outputEvalSeconds, 3)
  outputTokensPerSecond = if ($outputEvalSeconds -gt 0) { [math]::Round($totalOutputTokens / $outputEvalSeconds, 3) } else { $null }
  measuredEnergyKwh = if ($MeasuredEnergyKwh.HasValue) { $MeasuredEnergyKwh.Value } else { $null }
  measuredOutputTokensPerKwh = $measuredTokensPerKwh
  joulesPerOutputToken = $joulesPerOutputToken
  peakWallWatts = if ($PeakWallWatts.HasValue) { $PeakWallWatts.Value } else { $null }
  peakHardwareTempC = if ($PeakHardwareTempC.HasValue) { $PeakHardwareTempC.Value } else { $null }
  sourceRef = $SourceRef
  runReceipts = $results
  truthBoundary = if ($MeasuredEnergyKwh.HasValue) {
    "Runtime token counts are measured by Ollama. Energy efficiency is only as trustworthy as the supplied external energy measurement."
  } else {
    "Runtime token counts and throughput are measured. Energy efficiency is NOT measured because no external energy reading was supplied."
  }
  safety = [ordered]@{
    changesPowerLimit = $false
    changesFanCurve = $false
    changesWindowsPowerPlan = $false
    controlsMains = $false
  }
}

$report | ConvertTo-Json -Depth 8 | Set-Content -Encoding UTF8 $OutputPath
$report | ConvertTo-Json -Depth 8
Write-Host ""
Write-Host "UberWatt local benchmark saved to $OutputPath"
if (-not $MeasuredEnergyKwh.HasValue) {
  Write-Host "Energy was not measured. UberWatt may use throughput data, but MUST NOT promote this run to tokens/kWh."
}
