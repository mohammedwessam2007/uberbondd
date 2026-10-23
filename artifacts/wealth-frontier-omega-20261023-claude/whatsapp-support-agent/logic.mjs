// Decision logic for the Phase 1 WhatsApp support agent.
//
// Every function here is self-contained (no imports, no closures over module
// state) because build-workflow.mjs copies each one verbatim into an n8n Code
// node. The node:test suite exercises these exact sources, so what is tested is
// what runs inside n8n.

export function normalizeInbound(body) {
  const out = [];
  for (const entry of body?.entry ?? []) {
    for (const change of entry?.changes ?? []) {
      const value = change?.value ?? {};
      const phoneNumberId = value?.metadata?.phone_number_id ?? null;
      const names = Object.fromEntries((value.contacts ?? []).map(c => [c.wa_id, c?.profile?.name ?? '']));
      for (const message of value.messages ?? []) {
        const text = message.type === 'text' ? message.text?.body ?? ''
          : message.type === 'button' ? message.button?.text ?? ''
          : message.type === 'interactive' ? (message.interactive?.button_reply?.title ?? message.interactive?.list_reply?.title ?? '')
          : '';
        out.push({
          waId: String(message.from ?? ''),
          name: names[message.from] ?? '',
          messageId: String(message.id ?? ''),
          timestamp: Number(message.timestamp ?? 0),
          type: message.type ?? 'unknown',
          text: String(text).trim(),
          phoneNumberId
        });
      }
    }
  }
  return out.filter(m => m.waId && m.messageId);
}

// WhatsApp retries a webhook until it gets a 2xx, so the same message id can
// arrive more than once. seen maps messageId -> first-seen epoch ms.
export function dedupeMessage(seen, messageId, nowMs, ttlMs = 48 * 3600 * 1000, maxEntries = 5000) {
  const next = {};
  for (const [id, at] of Object.entries(seen ?? {})) if (nowMs - at < ttlMs) next[id] = at;
  const duplicate = Object.prototype.hasOwnProperty.call(next, messageId);
  if (!duplicate) next[messageId] = nowMs;
  const ids = Object.keys(next);
  if (ids.length > maxEntries) {
    ids.sort((a, b) => next[a] - next[b]);
    for (const id of ids.slice(0, ids.length - maxEntries)) delete next[id];
  }
  return { duplicate, seen: next };
}

export function detectLanguage(text) {
  const s = String(text ?? '');
  const devanagari = (s.match(/[ऀ-ॿ]/g) ?? []).length;
  const latin = (s.match(/[A-Za-z]/g) ?? []).length;
  if (devanagari > 0 && devanagari >= latin) return 'hi';
  const hinglish = /\b(kya|kaise|kab|kyu|kyun|nahi|nahin|hai|hain|mera|meri|mujhe|paisa|paise|wapas|karna|kar|chahiye|bhai|haan|abhi|jaldi)\b/i;
  if (hinglish.test(s)) return 'hinglish';
  return 'en';
}

export function extractReferences(text) {
  const s = String(text ?? '');
  const uniq = values => [...new Set(values)];
  const paymentIds = uniq(s.match(/\bpay_[A-Za-z0-9]{14}\b/g) ?? []);
  const orderIds = uniq(s.match(/\border_[A-Za-z0-9]{14}\b/g) ?? []);
  // A customer who types a pay_/order_ token with the wrong length still has a
  // payment question; it must not fall through to the FAQ model.
  const malformedIds = uniq((s.match(/\b(?:pay|order)_[A-Za-z0-9]+\b/g) ?? []).filter(id => !paymentIds.includes(id) && !orderIds.includes(id)));
  return {
    paymentIds,
    orderIds,
    malformedIds,
    emails: uniq(s.match(/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g) ?? [])
  };
}

// Deterministic routing runs before any model call. Money and anger are never
// left to the model's discretion.
export function classifyIntent(text, references) {
  const s = String(text ?? '').toLowerCase();
  const refs = { paymentIds: [], orderIds: [], malformedIds: [], ...(references ?? {}) };
  const escalate = /\b(human|agent|manager|real person|complaint|fraud|scam|cheat|legal|lawyer|consumer court|police|chargeback)\b|शिकायत|धोखा|इंसान से बात/.test(s);
  if (escalate) return { route: 'escalate', reason: 'explicit escalation or dispute language' };
  const refund = /\b(refund|money back|cancel(?:lation)?|return my money|paisa wapas|paise wapas)\b|रिफंड|पैसे वापस|वापसी/.test(s);
  if (refund) return { route: 'refund', reason: 'refund request' };
  // "When do I get access?" is an FAQ question; only money words or an id make
  // it a payment lookup. "I paid but have no access" still matches on "paid".
  const hasReference = refs.paymentIds.length > 0 || refs.orderIds.length > 0 || refs.malformedIds.length > 0;
  const payment = hasReference || /\b(payment|paid|pay|transaction|charged|deducted|debited|upi)\b|भुगतान|पेमेंट/.test(s);
  if (payment) return { route: 'payment_status', reason: hasReference ? 'reference supplied' : 'payment question' };
  return { route: 'faq', reason: 'general question' };
}

// Only fields that are safe to repeat back to the customer leave this function.
export function mapRazorpayPayment(payment) {
  if (!payment || typeof payment !== 'object' || !payment.id) return { found: false };
  const refunded = payment.refund_status === 'full' || payment.status === 'refunded';
  return {
    found: true,
    id: payment.id,
    status: refunded ? 'refunded' : payment.refund_status === 'partial' ? 'partially_refunded' : String(payment.status ?? 'unknown'),
    amountInr: Number.isFinite(payment.amount) ? payment.amount / 100 : null,
    currency: payment.currency ?? 'INR',
    method: payment.method ?? null,
    createdAt: Number.isFinite(payment.created_at) ? new Date(payment.created_at * 1000).toISOString() : null
  };
}

export function paymentReply(summary, language, missingReference) {
  const hi = language === 'hi';
  if (missingReference) {
    return hi
      ? 'कृपया अपनी Razorpay पेमेंट ID भेजें (pay_ से शुरू होती है)। यह आपके पेमेंट कन्फ़र्मेशन ईमेल में मिलेगी।'
      : 'Please send your Razorpay payment ID (it starts with pay_). You can find it in your payment confirmation email.';
  }
  if (!summary?.found) {
    return hi
      ? 'हमें यह पेमेंट ID नहीं मिली। कृपया ID दोबारा जाँचें, या हमारी टीम आपकी मदद करेगी।'
      : "We couldn't find that payment ID. Please double-check it, or our team will help you.";
  }
  const amount = summary.amountInr == null ? '' : ` of ₹${summary.amountInr}`;
  const en = {
    captured: `Your payment${amount} (${summary.id}) is confirmed. If you still can't access the product, reply "access" and we'll fix it.`,
    authorized: `Your payment${amount} (${summary.id}) is authorised and still processing. It usually completes shortly.`,
    failed: `Your payment${amount} (${summary.id}) did not go through. If money was deducted, your bank normally reverses it automatically within 5–7 working days.`,
    refunded: `Your payment${amount} (${summary.id}) has been refunded. Banks usually show the credit within 5–7 working days.`,
    partially_refunded: `Your payment${amount} (${summary.id}) has been partly refunded. Reply "human" if you need details.`,
    created: `Your payment (${summary.id}) was started but not completed. Please try again or reply "human" for help.`
  };
  const hiText = {
    captured: `आपका पेमेंट${amount ? ` ₹${summary.amountInr}` : ''} (${summary.id}) कन्फ़र्म है। अगर अभी भी एक्सेस नहीं मिला, "access" लिखें।`,
    authorized: `आपका पेमेंट (${summary.id}) प्रोसेस हो रहा है, जल्द पूरा होगा।`,
    failed: `आपका पेमेंट (${summary.id}) पूरा नहीं हुआ। अगर पैसे कटे हैं तो बैंक आमतौर पर 5–7 कार्यदिवस में वापस कर देता है।`,
    refunded: `आपका पेमेंट (${summary.id}) रिफंड हो चुका है। बैंक में 5–7 कार्यदिवस में दिखेगा।`,
    partially_refunded: `आपके पेमेंट (${summary.id}) का आंशिक रिफंड हुआ है। जानकारी के लिए "human" लिखें।`,
    created: `आपका पेमेंट (${summary.id}) शुरू हुआ लेकिन पूरा नहीं हुआ। कृपया दोबारा कोशिश करें।`
  };
  const table = hi ? hiText : en;
  return table[summary.status] ?? (hi
    ? `आपके पेमेंट (${summary.id}) की स्थिति: ${summary.status}. हमारी टीम मदद करेगी।`
    : `Your payment (${summary.id}) status is "${summary.status}". Our team can help if anything looks wrong.`);
}

export function maskPhone(waId) {
  const s = String(waId ?? '');
  return s.length <= 4 ? '****' : `${'*'.repeat(s.length - 4)}${s.slice(-4)}`;
}

export function refundRow(message, references, nowIso) {
  return {
    received_at: nowIso,
    customer_name: message.name ?? '',
    whatsapp: message.waId,
    payment_id: references.paymentIds[0] ?? '',
    order_id: references.orderIds[0] ?? '',
    language: message.language ?? 'en',
    customer_message: String(message.text ?? '').slice(0, 1000),
    status: 'PENDING_APPROVAL',
    message_id: message.messageId
  };
}

export function refundAck(language, hasPaymentId) {
  if (language === 'hi') {
    return hasPaymentId
      ? 'आपका रिफंड अनुरोध दर्ज हो गया है। हमारी टीम इसकी समीक्षा करके आपको जवाब देगी।'
      : 'आपका रिफंड अनुरोध दर्ज हो गया है। कृपया अपनी पेमेंट ID (pay_…) भी भेजें ताकि हम जल्दी जाँच कर सकें।';
  }
  return hasPaymentId
    ? 'Your refund request is logged. Our team will review it and get back to you.'
    : 'Your refund request is logged. Please also send your payment ID (starts with pay_) so we can check it faster.';
}

export function escalationAck(language) {
  return language === 'hi'
    ? 'मैं आपको हमारी टीम से जोड़ रहा हूँ। एक व्यक्ति जल्द ही यहीं जवाब देगा।'
    : "I'm connecting you with our team. A person will reply here shortly.";
}

export function escalationSlackText(message, reason, history) {
  const lines = (history ?? []).slice(-10).map(h => `${h.role === 'customer' ? 'Customer' : 'Agent'}: ${String(h.text).slice(0, 300)}`);
  return [
    `:rotating_light: WhatsApp escalation (${reason})`,
    `Customer: ${message.name || 'unknown'} · ${maskPhone(message.waId)} · language ${message.language ?? 'en'}`,
    'Recent conversation:',
    ...(lines.length ? lines : [`Customer: ${String(message.text ?? '').slice(0, 300)}`]),
    `Reply from the WhatsApp Business inbox to +${message.waId}.`
  ].join('\n');
}

export function refundSlackText(row) {
  return `:moneybag: Refund request for approval\nCustomer: ${row.customer_name || 'unknown'} · ${maskPhone(row.whatsapp)}\nPayment: ${row.payment_id || 'not supplied'} · Order: ${row.order_id || 'n/a'}\nMessage: ${row.customer_message.slice(0, 300)}\nLogged to the refunds sheet as PENDING_APPROVAL.`;
}

export function buildFaqMessages(faqText, brandName, message, history) {
  const languageRule = message.language === 'hi'
    ? 'Reply in Hindi (Devanagari script).'
    : message.language === 'hinglish'
      ? 'Reply in Hinglish (Hindi written in Latin script), matching the customer.'
      : 'Reply in English.';
  const system = [
    `You are the WhatsApp support assistant for ${brandName}.`,
    'Answer ONLY from the FAQ and policy text below. If the answer is not in it, or the customer is upset, say a team member will help and set needs_human to true.',
    'Never promise refunds, discounts or timelines that the policy does not state. Never ask for card numbers, OTPs or passwords.',
    'Keep answers under 80 words, friendly and plain.',
    languageRule,
    'Return JSON: {"answer": string, "confidence": number between 0 and 1, "needs_human": boolean}.',
    '--- FAQ AND POLICY ---',
    String(faqText ?? '').slice(0, 24000)
  ].join('\n');
  const prior = (history ?? []).slice(-6).map(h => ({ role: h.role === 'customer' ? 'user' : 'assistant', content: String(h.text) }));
  return [{ role: 'system', content: system }, ...prior, { role: 'user', content: String(message.text ?? '') }];
}

export function parseAiAnswer(content, minConfidence = 0.6) {
  let parsed;
  try { parsed = typeof content === 'string' ? JSON.parse(content) : content; } catch { parsed = null; }
  const answer = typeof parsed?.answer === 'string' ? parsed.answer.trim() : '';
  const confidence = Number(parsed?.confidence);
  const needsHuman = parsed?.needs_human === true || !answer || !Number.isFinite(confidence) || confidence < minConfidence;
  return { answer, confidence: Number.isFinite(confidence) ? confidence : null, escalate: needsHuman, reason: needsHuman ? (!answer ? 'model returned no usable answer' : 'model low confidence or asked for a human') : null };
}

export function appendHistory(store, waId, role, text, maxTurns = 12) {
  const next = { ...(store ?? {}) };
  const turns = [...(next[waId] ?? []), { role, text: String(text ?? '').slice(0, 500) }];
  next[waId] = turns.slice(-maxTurns);
  return next;
}
