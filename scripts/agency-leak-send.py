#!/usr/bin/env python3
"""Send founder-approved first-touch emails from review.csv. Python standard library only.

Safety rules, enforced in code:
  - dry run unless --send is given;
  - only rows with status SEND_CANDIDATE AND approve == SEND (typed by the founder) are sent;
  - an address is never emailed twice (sent-log.jsonl), and suppression.txt is always honoured;
  - per-mailbox daily cap (default 10, hard maximum 15) and per-run cap (default 20, hard maximum 30);
  - random pause between messages; stops at the first authentication failure;
  - every message carries the sender's postal address, a commercial-message notice and an opt-out line.

Usage:
  python3 scripts/agency-leak-send.py --out out --config ~/.uberbond/sender.json          # dry run
  python3 scripts/agency-leak-send.py --out out --config ~/.uberbond/sender.json --send   # real send
"""
import argparse, csv, datetime, json, os, random, smtplib, ssl, sys, time
from email.message import EmailMessage
from email.utils import formatdate, make_msgid

HARD_PER_MAILBOX, HARD_PER_RUN = 15, 30


def load_config(path):
    with open(os.path.expanduser(path)) as f:
        cfg = json.load(f)
    missing = [k for k in ('sender_name', 'postal_address', 'mailboxes') if not cfg.get(k)]
    if missing:
        sys.exit(f"config is missing: {', '.join(missing)}")
    for m in cfg['mailboxes']:
        for k in ('address', 'smtp_host', 'smtp_port'):
            if not m.get(k):
                sys.exit(f"a mailbox entry is missing {k}")
    cfg['per_mailbox_per_day'] = min(int(cfg.get('per_mailbox_per_day', 10)), HARD_PER_MAILBOX)
    cfg['per_run'] = min(int(cfg.get('per_run', 20)), HARD_PER_RUN)
    cfg['min_delay_s'] = max(0, int(cfg.get('min_delay_s', 90)))
    cfg['max_delay_s'] = max(cfg['min_delay_s'], int(cfg.get('max_delay_s', 240)))
    return cfg


def read_log(path):
    if not os.path.exists(path):
        return []
    with open(path) as f:
        return [json.loads(line) for line in f if line.strip()]


def footer(cfg):
    return ("\n\n--\n"
            f"Commercial message from {cfg['sender_name']}, {cfg['postal_address']}.\n"
            "Reply \"stop\" and I won't email you again.")


def build_message(row, body, mailbox, cfg):
    msg = EmailMessage()
    msg['From'] = f"{cfg['sender_name']} <{mailbox['address']}>"
    msg['To'] = row['to']
    msg['Subject'] = row['subject']
    msg['Date'] = formatdate(localtime=False)
    msg['Message-ID'] = make_msgid(domain=mailbox['address'].split('@')[1])
    msg.set_content(body.rstrip() + footer(cfg))
    return msg


def smtp_send(mailbox, msg, insecure_local_test=False):
    host, port = mailbox['smtp_host'], int(mailbox['smtp_port'])
    password = mailbox.get('password') or os.environ.get(mailbox.get('password_env', ''), '')
    if insecure_local_test:
        server = smtplib.SMTP(host, port, timeout=30)
    elif port == 465:
        server = smtplib.SMTP_SSL(host, port, timeout=30, context=ssl.create_default_context())
    else:
        server = smtplib.SMTP(host, port, timeout=30)
        server.starttls(context=ssl.create_default_context())
    try:
        if mailbox.get('username'):
            server.login(mailbox['username'], password)
        server.send_message(msg)
    finally:
        try:
            server.quit()
        except Exception:
            pass


def main(argv=None):
    ap = argparse.ArgumentParser()
    ap.add_argument('--out', default='out')
    ap.add_argument('--config', required=True)
    ap.add_argument('--send', action='store_true')
    ap.add_argument('--insecure-local-test', action='store_true', help=argparse.SUPPRESS)
    ap.add_argument('--no-delay', action='store_true', help=argparse.SUPPRESS)
    a = ap.parse_args(argv)
    cfg = load_config(a.config)
    log_path = os.path.join(a.out, 'sent-log.jsonl')
    supp_path = os.path.join(a.out, 'suppression.txt')
    log = read_log(log_path)
    suppressed = set()
    if os.path.exists(supp_path):
        with open(supp_path) as f:
            suppressed = {line.strip().lower() for line in f if '@' in line}
    already = {e['to'].lower() for e in log if e.get('result') == 'SENT'}
    today = datetime.datetime.now(datetime.timezone.utc).date().isoformat()
    used = {m['address']: sum(1 for e in log if e.get('result') == 'SENT' and e.get('from') == m['address'] and e.get('at', '').startswith(today)) for m in cfg['mailboxes']}

    with open(os.path.join(a.out, 'review.csv'), newline='') as f:
        rows = list(csv.DictReader(f))
    queue, skipped = [], []
    for r in rows:
        to = r.get('to', '').strip().lower()
        if r.get('status') != 'SEND_CANDIDATE':
            continue
        if r.get('approve', '').strip() != 'SEND':
            skipped.append((r['id'], 'NOT_APPROVED'))
        elif to in suppressed:
            skipped.append((r['id'], 'SUPPRESSED'))
        elif to in already:
            skipped.append((r['id'], 'ALREADY_SENT'))
        else:
            queue.append(r)
            already.add(to)  # also dedupes repeated addresses within this file

    sent = 0
    print(f"{'REAL SEND' if a.send else 'DRY RUN'}: {len(queue)} approved and sendable, {len(skipped)} skipped")
    for r in queue:
        if sent >= cfg['per_run']:
            print('per-run cap reached; stopping'); break
        mailbox = next((m for m in cfg['mailboxes'] if used[m['address']] < cfg['per_mailbox_per_day']), None)
        if not mailbox:
            print('every mailbox is at its daily cap; stopping'); break
        with open(os.path.join(a.out, r['draft_file'])) as f:
            body = f.read()
        msg = build_message(r, body, mailbox, cfg)
        if not a.send:
            print(f"--- would send #{r['id']} from {mailbox['address']} to {r['to']}\nSubject: {r['subject']}\n{msg.get_content()}")
            used[mailbox['address']] += 1; sent += 1
            continue
        entry = {'id': r['id'], 'to': r['to'], 'from': mailbox['address'], 'subject': r['subject'], 'at': datetime.datetime.now(datetime.timezone.utc).isoformat()}
        try:
            smtp_send(mailbox, msg, a.insecure_local_test)
            entry['result'] = 'SENT'; used[mailbox['address']] += 1; sent += 1
            print(f"sent #{r['id']} to {r['to']} from {mailbox['address']}")
        except smtplib.SMTPAuthenticationError as e:
            entry['result'] = 'AUTH_FAILED'; entry['error'] = str(e)[:200]
            with open(log_path, 'a') as f:
                f.write(json.dumps(entry) + '\n')
            sys.exit(f"login failed for {mailbox['address']}; stopped. Fix the password and run again.")
        except Exception as e:  # recipient refused, timeout, etc.: log and continue
            entry['result'] = 'FAILED'; entry['error'] = f"{type(e).__name__}: {str(e)[:200]}"
            print(f"FAILED #{r['id']} to {r['to']}: {entry['error']}")
        with open(log_path, 'a') as f:
            f.write(json.dumps(entry) + '\n')
        if not a.no_delay and r is not queue[-1]:
            time.sleep(random.randint(cfg['min_delay_s'], cfg['max_delay_s']))
    print(f"done: {sent} {'sent' if a.send else 'would be sent'}")
    return 0


if __name__ == '__main__':
    sys.exit(main())
