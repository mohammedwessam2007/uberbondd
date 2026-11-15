// SMTP recipient probe: asks a mail server whether it would accept a recipient,
// then quits before DATA. No message is ever sent.
//
// Plain TCP only. A server that demands STARTTLS before MAIL is reported as
// UNKNOWN rather than guessed at.
import net from 'node:net';

export const RCPT = Object.freeze({ ACCEPTED: 'ACCEPTED', REJECTED_MAILBOX: 'REJECTED_MAILBOX', MAILBOX_FULL: 'MAILBOX_FULL', BLOCKED: 'BLOCKED', TEMPFAIL: 'TEMPFAIL', AMBIGUOUS: 'AMBIGUOUS' });

const POLICY = /spamhaus|blocklist|blacklist|black list|\brbl\b|dnsbl|reputation|blocked|denied|not allowed|not permitted|refused|banned|policy|client host|your ip|ip address|helo|spf|greylist|too many|rate limit|try again|starttls|tls required|authentication required|relay/i;
const NO_MAILBOX = /user unknown|unknown user|no such (?:user|recipient|mailbox|address|person)|does(?: not|n't) exist|doesn't have an? .*account|not (?:a )?valid (?:recipient|mailbox|user)|invalid (?:recipient|mailbox|address|user)|recipient (?:address )?rejected|address rejected|mailbox (?:not found|unavailable|disabled|is disabled|does not exist)|user (?:not found|doesn't exist|disabled)|account (?:disabled|inactive|has been disabled)|no mailbox|unrouteable address|undeliverable/i;

// One reply → what it says about the recipient. Policy language wins over
// mailbox language: "550 5.7.1 blocked" is about us, not about the address.
export function classifyRcptReply({ code, enhanced = '', text = '' }) {
  if (code === 250 || code === 251) return RCPT.ACCEPTED;
  if (code >= 400 && code < 500) return RCPT.TEMPFAIL;
  if (code < 500 || code >= 600) return RCPT.AMBIGUOUS;
  if (enhanced.startsWith('5.7.') || code === 530 || code === 535) return RCPT.BLOCKED;
  if (code === 552 || enhanced === '5.2.2' || /quota|mailbox (?:is )?full|over ?quota|exceeded storage/i.test(text)) return RCPT.MAILBOX_FULL;
  // 5.4.1 "Recipient address rejected: Access denied" is how Microsoft 365 edge blocking refuses a recipient that is not in the tenant directory.
  const mailboxCode = /^5\.1\.(?:1|10|6)$/.test(enhanced) || enhanced === '5.2.1' || (enhanced === '5.4.1' && /recipient address rejected/i.test(text));
  if (mailboxCode) return RCPT.REJECTED_MAILBOX;
  if (POLICY.test(text)) return RCPT.BLOCKED;
  if ([550, 551, 553, 554].includes(code) && NO_MAILBOX.test(text)) return RCPT.REJECTED_MAILBOX;
  return RCPT.AMBIGUOUS;
}

export function parseReply(lines) {
  const last = lines.at(-1) ?? '';
  const code = Number(last.slice(0, 3));
  const text = lines.map(l => l.slice(4)).join(' ').replace(/\s+/g, ' ').trim();
  const enhanced = (text.match(/^(\d\.\d{1,3}\.\d{1,3})\b/) ?? [])[1] ?? '';
  return { code: Number.isInteger(code) ? code : 0, enhanced, text: text.slice(0, 200) };
}

// Opens one session and asks about each recipient in order.
// Resolves { reached, stage, error, replies: Map<rcpt, {code, enhanced, text, verdict}> }.
export function smtpProbe({ host, port = 25, heloName, mailFrom, recipients, timeoutMs = 15000, connect = net.connect }) {
  return new Promise(resolve => {
    const replies = new Map();
    let stage = 'CONNECT', buffer = '', lines = [], pending = null, done = false;
    const socket = connect({ host, port });
    const finish = (extra = {}) => {
      if (done) return; done = true;
      clearTimeout(timer); socket.destroy();
      resolve({ host, reached: stage !== 'CONNECT', stage, replies, ...extra });
    };
    const timer = setTimeout(() => finish({ error: 'TIMEOUT' }), timeoutMs);
    const nextReply = () => new Promise((res, rej) => { pending = { res, rej }; pump(); });
    function pump() {
      let idx;
      while (pending && (idx = buffer.indexOf('\n')) >= 0) {
        const line = buffer.slice(0, idx).replace(/\r$/, ''); buffer = buffer.slice(idx + 1);
        if (!/^\d{3}[ -]/.test(line) && !/^\d{3}$/.test(line)) { const p = pending; pending = null; p.rej(new Error('PROTOCOL')); return; }
        lines.push(line);
        if (line[3] !== '-') { const reply = parseReply(lines); lines = []; const p = pending; pending = null; p.res(reply); }
      }
      if (buffer.length > 65536) { const p = pending; pending = null; p?.rej(new Error('PROTOCOL')); }
    }
    const send = cmd => { socket.write(`${cmd}\r\n`); return nextReply(); };
    socket.setEncoding('latin1');
    socket.on('data', chunk => { buffer += chunk; pump(); });
    socket.on('error', e => { pending?.rej(e); finish({ error: e.code ?? 'SOCKET_ERROR' }); });
    socket.on('close', () => { pending?.rej(new Error('CLOSED')); finish({ error: 'CLOSED' }); });
    (async () => {
      try {
        const greeting = await nextReply(); stage = 'GREETING';
        if (greeting.code !== 220) return finish({ error: 'GREETING_REFUSED', greeting });
        let hello = await send(`EHLO ${heloName}`); stage = 'HELLO';
        if (hello.code !== 250) hello = await send(`HELO ${heloName}`);
        if (hello.code !== 250) return finish({ error: 'HELLO_REFUSED', hello });
        const from = await send(`MAIL FROM:<${mailFrom}>`); stage = 'MAIL';
        if (from.code !== 250) return finish({ error: 'MAIL_FROM_REFUSED', mailFromReply: from });
        for (const rcpt of recipients) {
          const reply = await send(`RCPT TO:<${rcpt}>`); stage = 'RCPT';
          replies.set(rcpt, { ...reply, verdict: classifyRcptReply(reply) });
        }
        socket.write('QUIT\r\n'); stage = 'DONE';
        finish();
      } catch (e) {
        finish({ error: e.code ?? e.message ?? 'ERROR' });
      }
    })();
  });
}

// True when at least one well-known MX accepts a TCP connection on port 25.
export async function smtpReachable(hosts, { port = 25, timeoutMs = 7000, connect = net.connect } = {}) {
  const attempts = await Promise.all(hosts.map(host => new Promise(resolve => {
    const s = connect({ host, port });
    const t = setTimeout(() => { s.destroy(); resolve(false); }, timeoutMs);
    s.once('connect', () => { clearTimeout(t); s.destroy(); resolve(true); });
    s.once('error', () => { clearTimeout(t); resolve(false); });
  })));
  return attempts.some(Boolean);
}
