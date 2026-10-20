// railway-entry.mjs
import { Pool as Pool3 } from "pg@8.22.0";

// api/webhooks/winnr.mjs
import { Pool } from "pg@8.22.0";

// src/uberwarm-vercel-node-bridge.mjs
function createUberWarmNodeBridge(fetchHandler, { maxBodyBytes = 65536 } = {}) {
  if (typeof fetchHandler !== "function" || !Number.isSafeInteger(maxBodyBytes) || maxBodyBytes < 1)
    throw Error("node-bridge-handler-and-finite-body-limit-required");
  return async function nodeHandler(req, res) {
    const method = String(req?.method || "GET").toUpperCase();
    if (!["GET", "POST", "HEAD"].includes(method)) {
      res.statusCode = 405;
      res.setHeader("allow", "GET, POST");
      res.end("Method not allowed");
      return;
    }
    let body = null;
    if (method === "POST") {
      const parts = [];
      let size = 0;
      try {
        for await (const item of req) {
          const part = Buffer.from(item);
          size += part.length;
          if (size > maxBodyBytes) {
            res.statusCode = 413;
            res.end("Request too large");
            return;
          }
          parts.push(part);
        }
        body = Buffer.concat(parts);
      } catch {
        res.statusCode = 400;
        res.end("Unable to read raw request");
        return;
      }
    }
    let response;
    try {
      const request = new Request("https://runtime.local.invalid" + (String(req?.url || "/").startsWith("/") ? req.url : "/"), {
        method,
        headers: req.headers || {},
        ...method === "POST" ? { body } : {},
        redirect: "manual"
      });
      response = await fetchHandler(request);
    } catch {
      res.statusCode = 503;
      res.end("Service unavailable");
      return;
    }
    if (!response || typeof response.arrayBuffer !== "function") {
      res.statusCode = 503;
      res.end("Service unavailable");
      return;
    }
    res.statusCode = response.status;
    for (const [key, value] of response.headers) res.setHeader(key, value);
    res.end(Buffer.from(await response.arrayBuffer()));
  };
}

// src/winnr-events.mjs
import { createHmac, timingSafeEqual } from "node:crypto";
function header(headers, name) {
  return typeof headers?.get === "function" ? headers.get(name) || "" : Object.entries(headers || {}).find(([k]) => k.toLowerCase() === name)?.[1] || "";
}
function verifyWinnrWebhookSignature({ rawBody = "", headers = {}, secret = "", now = Date.now(), toleranceSeconds = 300 } = {}) {
  const timestamp = String(header(headers, "x-winnr-timestamp") || "").trim();
  const signatureHeader = String(header(headers, "x-winnr-signature") || "");
  const ts = Number(timestamp);
  if (!timestamp || !Number.isFinite(ts) || Math.abs(Number(now) / 1e3 - ts) > toleranceSeconds) return { ok: false, reason: "invalid-or-stale-timestamp" };
  if (typeof secret !== "string" || !secret.startsWith("whsec_") || !signatureHeader) return { ok: false, reason: "signature-or-secret-missing" };
  const expected = createHmac("sha256", secret).update(`${timestamp}.`).update(Buffer.isBuffer(rawBody) ? rawBody : Buffer.from(String(rawBody), "utf8")).digest("hex");
  const ok = signatureHeader.split(",").some((part) => {
    const c = part.trim();
    if (!c.startsWith("v1=") || c.length !== 67) return false;
    try {
      return timingSafeEqual(Buffer.from(c.slice(3)), Buffer.from(expected));
    } catch {
      return false;
    }
  });
  return { ok, reason: ok ? null : "signature-mismatch" };
}
function normalizeWinnrEvent(event = {}) {
  const recipient = typeof event?.data?.recipient === "string" ? event.data.recipient.trim().toLowerCase() : null;
  return { recipient };
}

// src/uberwarm-winnr-webhook-suppression.mjs
import { createHash } from "node:crypto";
var sha = (x) => "sha256:" + createHash("sha256").update(x).digest("hex");
var validId = (s) => typeof s === "string" && /^[a-zA-Z0-9._:-]{1,240}$/.test(s);
var validEmail = (s) => typeof s === "string" && s.length <= 320 && /^[a-z0-9._%+-]+@[a-z0-9-]+(?:\.[a-z0-9-]+)+$/.test(s) && s === s.toLowerCase();
var adverse = /* @__PURE__ */ new Set(["email.bounced", "email.complained"]);
function parseAuthenticatedWinnrEvent(raw) {
  let json3;
  try {
    json3 = JSON.parse(raw.toString("utf8"));
  } catch {
    return { ok: false, reason: "invalid-event-json" };
  }
  if (!json3 || typeof json3 !== "object" || Array.isArray(json3) || !validId(json3.id) || typeof json3.type !== "string" || json3.type.length > 120 || json3.object !== "event" || !json3.data || typeof json3.data !== "object" || Array.isArray(json3.data))
    return { ok: false, reason: "invalid-provider-event-envelope" };
  const normalized = normalizeWinnrEvent(json3);
  const type = json3.type;
  const target = adverse.has(type) ? normalized.recipient : null;
  if (adverse.has(type) && !validEmail(target))
    return { ok: false, reason: "adverse-recipient-identity-invalid" };
  const action = adverse.has(type) ? "SUPPRESSED_RECIPIENT" : type === "email.received" ? "REPLY_REQUIRES_REVIEW" : "RECORDED_NO_SUPPRESSION";
  const when = json3.created;
  if (when !== void 0 && (typeof when !== "string" || !Number.isFinite(Date.parse(when))))
    return { ok: false, reason: "invalid-provider-event-time" };
  return {
    ok: true,
    eventId: json3.id,
    eventType: type,
    action,
    target,
    payloadDigest: sha(raw),
    recipientDigest: target ? sha(target) : null,
    providerOccurredAt: when || null
  };
}
async function persistAuthenticatedWinnrEvent(pool4, parsed) {
  if (!parsed?.ok || !validId(parsed.eventId) || !pool4 || typeof pool4.connect !== "function")
    throw Error("verified-event-and-transactional-postgres-required");
  const client = await pool4.connect();
  let transaction = false;
  try {
    await client.query("BEGIN");
    transaction = true;
    await client.query("SELECT pg_advisory_xact_lock(hashtext($1))", [`winnr:${parsed.eventId}`]);
    const inserted = await client.query(
      `INSERT INTO winnr_webhook_events
      (event_id,event_type,payload_digest,recipient_digest,action,provider_occurred_at)
      VALUES($1,$2,$3,$4,$5,$6::timestamptz)
      ON CONFLICT(event_id) DO NOTHING RETURNING event_id`,
      [parsed.eventId, parsed.eventType, parsed.payloadDigest, parsed.recipientDigest, parsed.action, parsed.providerOccurredAt]
    );
    let duplicate = inserted.rowCount === 0;
    if (duplicate) {
      const old = await client.query("SELECT payload_digest FROM winnr_webhook_events WHERE event_id=$1", [parsed.eventId]);
      if (old.rows.length !== 1 || old.rows[0].payload_digest !== parsed.payloadDigest)
        throw Error("provider-event-id-payload-conflict");
    } else if (parsed.action === "SUPPRESSED_RECIPIENT") {
      const id = `winnr_${createHash("sha256").update(parsed.target).digest("hex").slice(0, 40)}`;
      const row = {
        id,
        value: parsed.target,
        reason: "winnr-provider-signed-adverse-event",
        eventType: parsed.eventType,
        sourceEventId: parsed.eventId
      };
      await client.query(
        `INSERT INTO suppressions(id,value,created_at,updated_at,data)
          VALUES($1,$2,now(),now(),$3::jsonb) ON CONFLICT (value) DO NOTHING`,
        [id, parsed.target, JSON.stringify(row)]
      );
      const found = await client.query("SELECT value FROM suppressions WHERE value=$1", [parsed.target]);
      if (found.rows.length !== 1 || found.rows[0].value !== parsed.target)
        throw Error("suppression-readback-failed");
    }
    await client.query("COMMIT");
    transaction = false;
    return Object.freeze({
      ok: true,
      status: duplicate ? "DUPLICATE" : parsed.action,
      duplicate,
      suppressionHeld: parsed.action === "SUPPRESSED_RECIPIENT",
      sendAuthority: "NONE",
      businessEffectAuthority: "NONE"
    });
  } catch (e) {
    if (transaction) await client.query("ROLLBACK").catch(() => {
    });
    throw e;
  } finally {
    client.release();
  }
}

// api/webhooks/winnr.mjs
var pool;
function getPool(env2) {
  if (!pool) pool = new Pool({ connectionString: env2.DATABASE_URL, max: 2, idleTimeoutMillis: 1e4 });
  return pool;
}
var result = (payload, status) => Response.json(payload, { status, headers: { "cache-control": "no-store", "x-content-type-options": "nosniff" } });
function createFetchHandler({ env: env2 = process.env, poolFactory = getPool, persist = persistAuthenticatedWinnrEvent, clock = Date.now } = {}) {
  return async (request) => {
    if (!env2.WINNR_WEBHOOK_SECRET?.startsWith("whsec_"))
      return result({ ok: false, status: "REFUSED", reasonCodes: ["verified-winnr-webhook-secret-required"] }, 503);
    if (!env2.DATABASE_URL)
      return result({ ok: false, status: "REFUSED", reasonCodes: ["canonical-database-url-required"] }, 503);
    const length = Number(request.headers.get("content-length"));
    if (Number.isFinite(length) && length > 65536)
      return result({ ok: false, status: "REFUSED", reasonCodes: ["body-too-large"] }, 413);
    let raw;
    try {
      raw = Buffer.from(await request.arrayBuffer());
    } catch {
      return result({ ok: false, status: "REFUSED", reasonCodes: ["raw-body-unavailable"] }, 400);
    }
    if (raw.length > 65536) return result({ ok: false, status: "REFUSED", reasonCodes: ["body-too-large"] }, 413);
    const proof = verifyWinnrWebhookSignature({
      rawBody: raw,
      headers: request.headers,
      secret: env2.WINNR_WEBHOOK_SECRET,
      now: Number(clock()),
      toleranceSeconds: 300
    });
    if (proof.ok !== true)
      return result({ ok: false, status: "REFUSED", reasonCodes: ["invalid-or-stale-signature"] }, 401);
    const parsed = parseAuthenticatedWinnrEvent(raw);
    if (!parsed.ok) return result({ ok: false, status: "REFUSED", reasonCodes: [parsed.reason] }, 422);
    try {
      const outcome = await persist(poolFactory(env2), parsed);
      return result({
        ok: true,
        status: outcome.status,
        duplicate: outcome.duplicate,
        suppressionHeld: outcome.suppressionHeld,
        sendAuthority: "NONE",
        businessEffectAuthority: "NONE"
      }, 200);
    } catch {
      return result({ ok: false, status: "REFUSED", reasonCodes: ["webhook-ledger-or-suppression-unavailable"] }, 503);
    }
  };
}
var POST = createFetchHandler();
var winnr_default = createUberWarmNodeBridge(POST);

// api/unsubscribe.mjs
import { Pool as Pool2 } from "pg@8.22.0";

// src/uberwarm-unsubscribe.mjs
import { createHmac as createHmac2, createHash as createHash2, timingSafeEqual as timingSafeEqual2 } from "node:crypto";
var isEmail = (value) => typeof value === "string" && value.length <= 320 && value === value.toLowerCase() && /^[a-z0-9._%+-]+@[a-z0-9-]+(?:\.[a-z0-9-]+)+$/.test(value);
var validSecret = (s) => typeof s === "string" && s.length >= 32 && s.length <= 512;
var mac = (body, secret) => createHmac2("sha256", secret).update(body, "utf8").digest("base64url");
function createUberWarmUnsubscribeToken({ recipientEmail, secret } = {}) {
  if (!isEmail(recipientEmail) || !validSecret(secret)) throw Error("exact-recipient-and-protected-optout-secret-required");
  const body = Buffer.from(JSON.stringify({ v: 1, email: recipientEmail, scope: "ALL_COMMERCIAL" })).toString("base64url");
  return `${body}.${mac(body, secret)}`;
}
function verifyUberWarmUnsubscribeToken({ token, secret } = {}) {
  if (!validSecret(secret) || typeof token !== "string" || token.length > 1200 || !/^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]{43}$/.test(token)) return null;
  const point = token.lastIndexOf("."), body = token.slice(0, point), signature = token.slice(point + 1);
  const expected = mac(body, secret);
  try {
    if (!timingSafeEqual2(Buffer.from(signature), Buffer.from(expected))) return null;
    const data = JSON.parse(Buffer.from(body, "base64url").toString("utf8"));
    if (!data || Object.keys(data).sort().join(",") !== "email,scope,v" || data.v !== 1 || data.scope !== "ALL_COMMERCIAL" || !isEmail(data.email) || createUberWarmUnsubscribeToken({ recipientEmail: data.email, secret }) !== token) return null;
    return Object.freeze({ recipientEmail: data.email, scope: "ALL_COMMERCIAL" });
  } catch {
    return null;
  }
}
async function persistUberWarmUnsubscribe(pool4, { recipientEmail } = {}) {
  if (!isEmail(recipientEmail) || !pool4 || typeof pool4.query !== "function")
    throw Error("verified-recipient-and-shared-postgres-required");
  const id = "optout_" + createHash2("sha256").update(recipientEmail).digest("hex").slice(0, 40);
  const row = { id, value: recipientEmail, reason: "recipient-self-service-unsubscribe", scope: "ALL_COMMERCIAL" };
  await pool4.query(
    `INSERT INTO suppressions(id,value,created_at,updated_at,data)
   VALUES($1,$2,now(),now(),$3::jsonb) ON CONFLICT (value) DO NOTHING`,
    [id, recipientEmail, JSON.stringify(row)]
  );
  const result2 = await pool4.query("SELECT value FROM suppressions WHERE value=$1", [recipientEmail]);
  if (result2.rows.length !== 1 || result2.rows[0].value !== recipientEmail)
    throw Error("unsubscribe-suppression-readback-failed");
  return Object.freeze({ ok: true, status: "UNSUBSCRIBED", suppressionHeld: true, sendAuthority: "NONE" });
}

// api/unsubscribe.mjs
var pool2;
var htmlHeaders = {
  "cache-control": "no-store",
  "referrer-policy": "no-referrer",
  "content-security-policy": "default-src 'none'; style-src 'unsafe-inline'; form-action 'self'; base-uri 'none'",
  "x-content-type-options": "nosniff",
  "content-type": "text/html; charset=utf-8"
};
var html = (text, status) => new Response(text, { status, headers: htmlHeaders });
var json = (body, status) => Response.json(body, { status, headers: { "cache-control": "no-store", "referrer-policy": "no-referrer", "x-content-type-options": "nosniff" } });
function db(env2) {
  if (!pool2) pool2 = new Pool2({ connectionString: env2.DATABASE_URL, max: 1, idleTimeoutMillis: 1e4 });
  return pool2;
}
var fail = "Unable to process this request. No email settings were changed.";
function createHandlers({ env: env2 = process.env, poolFactory = db, persist = persistUberWarmUnsubscribe } = {}) {
  const read = (request) => {
    let token;
    try {
      token = new URL(request.url).searchParams.get("token") || "";
    } catch {
      return null;
    }
    return verifyUberWarmUnsubscribeToken({ token, secret: env2.UBERWARM_UNSUBSCRIBE_SECRET });
  };
  const GET2 = async (request) => {
    if (!read(request)) return html(fail, 400);
    return html(`<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Unsubscribe from UberBond</title><main><h1>Stop UberBond commercial emails</h1><p>You can stop all future UberBond commercial emails to the address associated with this link.</p><form method="post"><button type="submit">Unsubscribe</button></form></main></html>`, 200);
  };
  const POST3 = async (request) => {
    if (!env2.UBERWARM_UNSUBSCRIBE_SECRET || !env2.DATABASE_URL) return json({ ok: false, status: "UNAVAILABLE" }, 503);
    const proof = read(request);
    if (!proof) return html(fail, 400);
    try {
      await persist(poolFactory(env2), proof);
      return html('<!doctype html><html lang="en"><meta charset="utf-8"><title>Unsubscribed</title><h1>You have been unsubscribed</h1><p>No further UberBond commercial email will be sent to this address.</p></html>', 200);
    } catch {
      return html("Your request could not be confirmed. Please try again.", 503);
    }
  };
  return { GET: GET2, POST: POST3 };
}
var { GET, POST: POST2 } = createHandlers();
var unsubscribe_default = createUberWarmNodeBridge((request) => request.method === "POST" ? POST2(request) : GET(request));

// railway-entry.mjs
var env = process.env;
var pool3;
function rawDb() {
  if (!pool3) {
    pool3 = new Pool3({ connectionString: env.DATABASE_URL, max: 2, connectionTimeoutMillis: 8e3, statement_timeout: 1e4 });
    pool3.on("error", () => {
    });
  }
  return pool3;
}
async function close() {
  if (pool3) await pool3.end();
}
async function verifiedClient() {
  const client = await rawDb().connect();
  try {
    const q = await client.query("SELECT current_database() AS database,pg_is_in_recovery() AS recovery,to_regclass('public.suppressions') IS NOT NULL AS stops,to_regclass('public.winnr_webhook_events') IS NOT NULL AS events");
    const r = q.rows[0];
    if (env.UBERWARM_EXPECTED_CANONICAL_DATABASE !== "railway" || q.rows.length !== 1 || r.database !== "railway" || r.recovery !== false || r.stops !== true || r.events !== true) throw Error("canonical-binding-required");
    return client;
  } catch (error) {
    client.release();
    throw error;
  }
}
var db2 = () => ({ connect: verifiedClient, async query(sql, values) {
  const c = await verifiedClient();
  try {
    return await c.query(sql, values);
  } finally {
    c.release();
  }
} });
var webhook = createFetchHandler({ env, poolFactory: db2 });
var unsubscribe = createHandlers({ env, poolFactory: db2 });
var json2 = (data, status = 200) => Response.json(data, { status, headers: { "cache-control": "no-store", "x-content-type-options": "nosniff", "referrer-policy": "no-referrer" } });
async function fetch(request) {
  const path = new URL(request.url).pathname;
  if (path === "/api/health" && request.method === "GET") {
    let canonicalDatabaseVerified = false;
    try {
      if (env.DATABASE_URL && env.UBERWARM_EXPECTED_CANONICAL_DATABASE === "railway") {
        const result2 = await db2().query("SELECT current_database() AS database,pg_is_in_recovery() AS recovery,to_regclass('public.suppressions') IS NOT NULL AS stops,to_regclass('public.winnr_webhook_events') IS NOT NULL AS events");
        const r = result2.rows[0];
        canonicalDatabaseVerified = result2.rows.length === 1 && r.database === "railway" && r.recovery === false && r.stops === true && r.events === true;
      }
    } catch {
    }
    return json2({
      service: "uberwarm-canonical-callback",
      httpReady: true,
      canonicalDatabaseVerified,
      signingConfigured: typeof env.WINNR_WEBHOOK_SECRET === "string" && env.WINNR_WEBHOOK_SECRET.startsWith("whsec_"),
      unsubscribeConfigured: typeof env.UBERWARM_UNSUBSCRIBE_SECRET === "string" && env.UBERWARM_UNSUBSCRIBE_SECRET.length >= 32,
      historicalBaseline: true,
      currentSuppressionContinuityVerified: false,
      sendAuthority: "NONE"
    });
  }
  if (path === "/api/webhooks/winnr") return request.method === "POST" ? webhook(request) : json2({ ok: false, status: "METHOD_NOT_ALLOWED" }, 405);
  if (path === "/api/unsubscribe") {
    if (request.method === "GET") return unsubscribe.GET(request);
    if (request.method === "POST") {
      const local = await unsubscribe.POST(request.clone());
      if (local.status !== 200) return local;
      const secret = env.UBERWARM_NEON_ORIGIN_SECRET;
      if (typeof secret !== "string" || secret.length < 32) return json2({ ok: false, status: "CROSS_STORE_OPTOUT_UNCONFIRMED", sendAuthority: "NONE" }, 503);
      try {
        const target = new URL("https://br-long-glade-at2hwz37-uberwarmoptout.compute.c-9.us-east-1.aws.neon.tech/unsubscribe");
        target.searchParams.set("token", new URL(request.url).searchParams.get("token") || "");
        const remote = await globalThis.fetch(target, { method: "POST", headers: { "x-secret": secret, "content-type": "application/x-www-form-urlencoded" }, body: "List-Unsubscribe=One-Click", redirect: "error", signal: AbortSignal.timeout(12e3) });
        if (remote.status !== 200) throw Error("mirror-unavailable");
        const receipt = await remote.json();
        if (receipt.ok !== true || receipt.status !== "UNSUBSCRIBED" || receipt.canonicalDatabaseVerified !== true || receipt.sendAuthority !== "NONE") throw Error("mirror-readback-unverified");
        return local;
      } catch {
        return json2({ ok: false, status: "CROSS_STORE_OPTOUT_UNCONFIRMED", sendAuthority: "NONE" }, 503);
      }
    }
    return json2({ ok: false, status: "METHOD_NOT_ALLOWED" }, 405);
  }
  return json2({ ok: false, status: "NOT_FOUND" }, 404);
}
var railway_entry_default = { port: Number(env.PORT || 3e3), fetch };
export {
  close,
  railway_entry_default as default,
  fetch
};
