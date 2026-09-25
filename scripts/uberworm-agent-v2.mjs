import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { spawnSync } from "node:child_process";
import { admitUberWormQueuedCommand, UBERWORM_APPROVED_MODELS, UBERWORM_NODE } from "../src/uberworm-policy.mjs";

const ROOT = process.cwd();
const CACHE = path.join(ROOT, ".cache");
const TOKEN_FILE = path.join(CACHE, "uberworm-token.dpapi");
const DISABLE_FILE = path.join(CACHE, "uberworm-disabled");
const LOG_FILE = path.join(CACHE, "uberworm-agent.log");
const ENDPOINT = "https://lslifasfebpjbtqmkitm.supabase.co/functions/v1/uberworm-node";
const NODE_ID = UBERWORM_NODE;
const APPROVED_MODELS = new Set(UBERWORM_APPROVED_MODELS);
const POLL_MS = 30000;

fs.mkdirSync(CACHE, { recursive: true });

function log(message) {
  const line = new Date().toISOString() + " " + String(message);
  console.log(line);
  try { fs.appendFileSync(LOG_FILE, line + "\n"); } catch {}
}

function run(exe, args, timeout = 600000) {
  const result = spawnSync(exe, args, {
    cwd: ROOT,
    encoding: "utf8",
    windowsHide: true,
    shell: false,
    timeout,
    env: process.env
  });
  return {
    ok: result.status === 0,
    status: result.status,
    stdout: String(result.stdout || "").trim(),
    stderr: String(result.stderr || "").trim()
  };
}

function decryptNodeToken() {
  if (!fs.existsSync(TOKEN_FILE)) throw new Error("node-token-file-missing");
  const ps = [
    "$e=Get-Content -Raw '" + TOKEN_FILE.replaceAll("'", "''") + "';",
    "$s=ConvertTo-SecureString $e;",
    "$p=[Runtime.InteropServices.Marshal]::SecureStringToBSTR($s);",
    "try{[Runtime.InteropServices.Marshal]::PtrToStringBSTR($p)}finally{[Runtime.InteropServices.Marshal]::ZeroFreeBSTR($p)}"
  ].join("");
  const result = run("powershell.exe", ["-NoProfile","-Command",ps], 10000);
  if (!result.ok || !result.stdout) throw new Error("node-token-decrypt-failed");
  return result.stdout.trim();
}

async function api(op, body = {}) {
  const token = decryptNodeToken();
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 15000);
  try {
    const response = await fetch(ENDPOINT, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-uberworm-node": NODE_ID,
        "x-uberworm-token": token
      },
      body: JSON.stringify({ op, ...body }),
      signal: controller.signal
    });
    const data = await response.json().catch(() => ({ ok:false, error:"invalid-json-response" }));
    if (!response.ok) throw new Error(data.error || ("http-" + response.status));
    return data;
  } finally {
    clearTimeout(timer);
  }
}

function inventory() {
  const output = path.join(CACHE, "uberwatt-hardware-report.json");
  const script = path.join(ROOT, "scripts", "uberwatt-windows-doctor.ps1");
  const result = run("powershell.exe", ["-NoProfile","-ExecutionPolicy","Bypass","-File",script,"-OutputPath",output], 120000);
  if (!result.ok) return { ok:false, error:result.stderr || result.stdout };
  try {
    const report = JSON.parse(fs.readFileSync(output, "utf8"));
    return {
      ok:true,
      host:report.host,
      cpu:report.cpu,
      memory:report.memory,
      graphics:report.graphics,
      disks:report.disks,
      battery:report.battery,
      ollama:report.ollama,
      candidate:report.candidate,
      safety:report.safety
    };
  } catch (error) {
    return { ok:false, error:"inventory-parse-failed:" + error.message };
  }
}

function ollamaStatus() {
  const ps = "try{(Invoke-RestMethod -Method Get -Uri 'http://127.0.0.1:11434/api/tags' -TimeoutSec 3)|ConvertTo-Json -Depth 6}catch{Write-Error $_;exit 2}";
  const result = run("powershell.exe", ["-NoProfile","-Command",ps], 10000);
  if (!result.ok) return { ok:false, error:result.stderr || result.stdout };
  try {
    const parsed = JSON.parse(result.stdout);
    return { ok:true, models:(parsed.models || []).map(x => ({ name:x.name, size:x.size, digest:x.digest })) };
  } catch (error) {
    return { ok:false, error:"ollama-status-parse-failed:" + error.message };
  }
}

function repoStatus() {
  const result = run("git", ["status","--short","--branch"], 20000);
  return { ok:result.ok, status:result.stdout, error:result.stderr };
}

function repoSyncMain() {
  const dirty = run("git", ["status","--porcelain"], 20000);
  if (!dirty.ok) return { ok:false, error:dirty.stderr || "git-status-failed" };
  if (dirty.stdout.trim()) return { ok:false, error:"working-tree-not-clean" };
  const fetch = run("git", ["fetch","origin","main"], 120000);
  if (!fetch.ok) return { ok:false, error:fetch.stderr || fetch.stdout };
  const checkout = run("git", ["checkout","main"], 30000);
  if (!checkout.ok) return { ok:false, error:checkout.stderr || checkout.stdout };
  const pull = run("git", ["pull","--ff-only","origin","main"], 120000);
  return { ok:pull.ok, stdout:pull.stdout, error:pull.stderr };
}

function pullModel(args) {
  const model = String(args?.model || "");
  if (!APPROVED_MODELS.has(model)) return { ok:false, error:"model-not-approved", approvedModels:[...APPROVED_MODELS] };
  const result = run("ollama", ["pull",model], 3600000);
  return { ok:result.ok, model, stdout:result.stdout.slice(-5000), error:result.stderr.slice(-3000) };
}

function benchmark(args) {
  const model = String(args?.model || "");
  if (!APPROVED_MODELS.has(model)) return { ok:false, error:"model-not-approved" };
  const runs = Math.max(1, Math.min(3, Number(args?.runs || 3)));
  const numPredict = Math.max(64, Math.min(256, Number(args?.numPredict || 256)));
  const output = path.join(CACHE, "uberwatt-benchmark-" + Date.now() + ".json");
  const script = path.join(ROOT, "scripts", "uberwatt-ollama-benchmark.ps1");
  const result = run("powershell.exe", [
    "-NoProfile","-ExecutionPolicy","Bypass","-File",script,
    "-Model",model,"-Runs",String(runs),"-NumPredict",String(numPredict),"-OutputPath",output
  ], 3600000);
  if (!result.ok) return { ok:false, error:result.stderr || result.stdout };
  try {
    const report = JSON.parse(fs.readFileSync(output, "utf8"));
    return {
      ok:true,
      model:report.model,
      outputTokens:report.outputTokens,
      promptTokens:report.promptTokens,
      durationSeconds:report.durationSeconds,
      outputTokensPerSecond:report.outputTokensPerSecond,
      measuredEnergyKwh:report.measuredEnergyKwh,
      measuredOutputTokensPerKwh:report.measuredOutputTokensPerKwh,
      truthBoundary:report.truthBoundary
    };
  } catch (error) {
    return { ok:false, error:"benchmark-parse-failed:" + error.message };
  }
}

function localPrompt(args) {
  const model = String(args?.model || "");
  const prompt = String(args?.prompt || "").slice(0, 2000);
  const numPredict = Math.max(16, Math.min(256, Number(args?.numPredict || 128)));
  if (!APPROVED_MODELS.has(model)) return { ok:false, error:"model-not-approved" };
  if (!prompt.trim()) return { ok:false, error:"prompt-required" };
  const body = JSON.stringify({ model, prompt, stream:false, options:{ temperature:0, num_predict:numPredict } });
  const ps = "$b=@'" + "\n" + body.replaceAll("'@", "' @") + "\n'@;try{Invoke-RestMethod -Method Post -Uri 'http://127.0.0.1:11434/api/generate' -ContentType 'application/json' -Body $b|ConvertTo-Json -Depth 6}catch{Write-Error $_;exit 2}";
  const result = run("powershell.exe", ["-NoProfile","-Command",ps], 600000);
  if (!result.ok) return { ok:false, error:result.stderr || result.stdout };
  try {
    const response = JSON.parse(result.stdout);
    return {
      ok:true,
      model,
      response:String(response.response || "").slice(0, 8000),
      outputTokens:Number(response.eval_count || 0),
      promptTokens:Number(response.prompt_eval_count || 0),
      evalDurationNs:Number(response.eval_duration || 0),
      totalDurationNs:Number(response.total_duration || 0)
    };
  } catch (error) {
    return { ok:false, error:"local-prompt-parse-failed:" + error.message };
  }
}

function execute(command) {
  const action = String(command?.action || "");
  const args = command?.args && typeof command.args === "object" ? command.args : {};
  if (action === "ping") return { ok:true, host:os.hostname(), at:new Date().toISOString(), version:"v2" };
  if (action === "inventory") return inventory();
  if (action === "ollama_status") return ollamaStatus();
  if (action === "repo_status") return repoStatus();
  if (action === "repo_sync_main") return repoSyncMain();
  if (action === "pull_model") return pullModel(args);
  if (action === "benchmark") return benchmark(args);
  if (action === "local_prompt") return localPrompt(args);
  if (action === "disable_agent") {
    fs.writeFileSync(DISABLE_FILE, new Date().toISOString());
    return { ok:true, disabled:true };
  }
  return { ok:false, error:"action-not-implemented" };
}

async function cycle() {
  if (fs.existsSync(DISABLE_FILE)) return false;
  const polled = await api("poll");
  const command = polled?.command;
  if (!command) return true;
  const admission = admitUberWormQueuedCommand(command, new Date());
  if (!admission.ok) {
    log("refused " + command.id + " " + admission.reasonCodes.join(","));
    await api("receipt", { commandId:command.id, ok:false, payload:{ error:"command-refused-locally", reasonCodes:admission.reasonCodes } });
    return true;
  }
  log("running " + command.id + " " + command.action);
  let result;
  try { result = execute(command); }
  catch (error) { result = { ok:false, error:"execution-exception:" + error.message }; }
  await api("receipt", { commandId:command.id, ok:result?.ok === true, payload:result });
  log("finished " + command.id + " ok=" + String(result?.ok === true));
  return command.action !== "disable_agent";
}

log("UberAgent v2 starting; arbitrary remote shell does not exist");
while (true) {
  try {
    const keepGoing = await cycle();
    if (!keepGoing) break;
  } catch (error) {
    log("cycle-error " + error.message);
  }
  await new Promise(resolve => setTimeout(resolve, POLL_MS));
}
log("UberAgent v2 stopped");
