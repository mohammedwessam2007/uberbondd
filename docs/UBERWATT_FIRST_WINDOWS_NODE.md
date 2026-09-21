# UberWatt first Windows compute node

Status: **SAFE FIRST-NODE BOOTSTRAP / NO MAINS CONTROL / NO POWER-LIMIT TUNING**

This runbook turns an existing Windows PC into UberWatt's first measurable local-compute worker.

## Physical layout

```
utility meter display --read only--> UberWatt ledger
                                    |
                                    v
iPad <---- home Wi-Fi ----> Windows HP compute node
                                    |
                                    v
                              Ollama localhost
                                    |
                                    v
                           local open-weight model
```

The HP is powered like an ordinary computer. UberWatt does not connect the HP to an AC, utility meter, breaker panel or household fixed wiring.

## 1. Put the HP in a boring physical position

Use:

- the normal manufacturer charger;
- a known-good wall outlet;
- a hard open surface;
- unobstructed vents;
- ordinary room ventilation.

Do not:

- put the computer on a bed, sofa or carpet that blocks vents;
- daisy-chain extension strips;
- open an outlet, breaker panel or utility meter;
- alter CPU/GPU power limits, voltage, firmware or fan curves for this first deployment.

## 2. Run the read-only doctor

From the repository root in Windows PowerShell:

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\scripts\uberwatt-windows-doctor.ps1
```

It writes:

```
uberwatt-hardware-report.json
```

The doctor records Windows version, CPU, RAM, visible GPUs, storage, battery status, Ollama state and a conservative first smoke-test model.

The doctor does not require administrator privileges and does not change the Windows power plan or any electrical/thermal setting.

## 3. Install Ollama only if missing

Use the official Windows installer:

https://ollama.com/download/windows

Current Ollama Windows support requires Windows 10 or later.

After installation, open Ollama once. Its local API normally serves on:

```
http://127.0.0.1:11434
```

Rerun the doctor and require:

```
ollama.installed = true
ollama.reachable = true
```

before proceeding.

## 4. Pull only the doctor-selected smoke-test model

Examples used by the current doctor:

- less than 6 GB RAM -> `qwen3:0.6b`
- 6 to under 10 GB -> `qwen3:1.7b`
- 10 to under 16 GB -> `qwen3:4b`
- 16 GB or more -> `qwen3:8b` for the first smoke test

These are starting points, not permanent winners.

Example:

```powershell
ollama pull qwen3:1.7b
ollama run qwen3:1.7b
```

OpenAI gpt-oss-20b is only a later candidate. Memory eligibility alone is not enough to promote it.

## 5. Measure real local token throughput

Example:

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\scripts\uberwatt-ollama-benchmark.ps1 -Model "qwen3:1.7b" -Runs 3 -NumPredict 256
```

This writes:

```
uberwatt-local-benchmark.json
```

Ollama runtime counters provide measured output-token counts and generation throughput.

Without an external energy measurement, the benchmark deliberately leaves token-per-kWh fields unproven.

## 6. Add computer-only energy metering later

For scientifically useful token/kWh measurements, place a reputable, appropriately rated plug-in energy meter on the **computer power path only**.

Do not use UberWatt's computer meter to switch or meter AC compressors, ovens, heaters or other high-power household loads.

Record the compute-node energy delta for the same benchmark window and pass it as `-MeasuredEnergyKwh`.

Example once a measured 0.04 kWh benchmark delta exists:

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\scripts\uberwatt-ollama-benchmark.ps1 -Model "qwen3:1.7b" -Runs 3 -NumPredict 256 -MeasuredEnergyKwh 0.04
```

Peak wall power and peak hardware temperature can also be supplied once independently measured:

```powershell
... -PeakWallWatts 65 -PeakHardwareTempC 72
```

Never invent these values.

## 7. MAX SAFE TOKENS admission

A node cannot enter MAX SAFE TOKENS mode merely because it can run a model.

UberWatt requires:

1. measured household energy headroom;
2. measured local inference output;
3. measured compute-node energy;
4. measured peak wall power;
5. sourced safe power ceiling for the real power path;
6. measured peak hardware temperature;
7. sourced thermal stop for the hardware.

Only then can the optimizer rank the node by measured output tokens per kWh and admit it to the spendable energy budget.

## Current first-node objective

The old HP is not expected to become the final high-performance inference machine. Its first jobs are:

- prove the end-to-end local inference path;
- provide real hardware measurements;
- run small open-weight models;
- host lightweight UberBond/UberWatt control work;
- establish the benchmark protocol that future GPU hardware must beat.

The first successful milestone is not "billions of tokens."

It is:

> one real local model, one measured token receipt, zero unsafe electrical changes.
