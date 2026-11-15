# Email Verifier: pay only for proven results

Bulk email verifier and validator for scraped lead lists. It checks every address with a live SMTP mailbox check, MX lookup and catch-all detection, and flags disposable and role addresses.

**You are charged only when the answer is proven.** Catch-all, unknown, duplicate and malformed addresses are returned free.

## What you pay for

| Result | What was proven | Charged |
|---|---|---|
| `MAILBOX_CONFIRMED` | The mail server accepted this address and refused a random address on the same domain | Yes |
| `MAILBOX_REJECTED` | The mail server refused this address as a mailbox that does not exist | Yes |
| `DOMAIN_CANNOT_RECEIVE` | Two independent DNS resolvers agree the domain does not exist or accepts no mail | Yes |
| `CATCH_ALL_DOMAIN` | The server accepts every address, so this one cannot be confirmed | No |
| `MAILBOX_FULL`, `SMTP_TEMPFAIL`, `SMTP_BLOCKED`, `SMTP_NO_ANSWER`, `ACCEPTED_UNCONFIRMED`, `DNS_UNRESOLVED` | The server would not give a clear answer | No |
| `INVALID_SYNTAX`, `DUPLICATE` | Found without contacting anyone | No |

On a typical scraped B2B list, a large share of addresses sit on catch-all domains or behind servers that will not answer. Most verifiers charge for those rows anyway. This one does not.

## Input

- **Email addresses**: paste a list, one per line.
- **Or a dataset ID**: verify the output of another Actor directly (Google Maps Email Extractor, Leads Finder, Contact Details Scraper and others). Set the field that holds the email; nested fields (`contact.email`) and arrays (`emails`) work.

## Output

One record per input row, in a dataset you can export as CSV, JSON or Excel:

```json
{
  "email": "jane@acme.com",
  "status": "deliverable",
  "verification": "MAILBOX_CONFIRMED",
  "definitive": true,
  "reasons": ["MAILBOX_CONFIRMED"],
  "flags": { "role": false, "freeProvider": false, "disposable": false, "catchAll": false, "mailboxFull": false },
  "didYouMean": null,
  "mx": { "status": "MX", "host": "aspmx.l.google.com", "witnesses": ["native"] },
  "smtp": { "code": 250, "enhanced": "2.1.5", "text": "2.1.5 OK" },
  "catchAllProbe": { "code": 550, "enhanced": "5.1.1", "text": "5.1.1 The email account that you tried to reach does not exist" },
  "checkedAt": "2026-11-15T12:00:00.000Z"
}
```

- `status` is the sending advice: `deliverable`, `undeliverable`, `risky`, `unknown` or `duplicate`.
- `verification` says exactly what was established, and `smtp` holds the server's own reply so you can check the verdict yourself.
- A confirmed mailbox on a disposable domain or a role address (`info@`, `sales@`) is marked `risky`.
- `didYouMean` suggests a fix for common typos such as `gmial.com`.

A `REPORT` record in the key-value store gives the totals for the run.

## How it works

1. **Syntax and duplicates.** Malformed and repeated addresses are set aside at no charge.
2. **Domain.** MX records are looked up. A domain is reported as unable to receive mail only when two independent resolvers agree.
3. **Mailbox.** The Actor opens an SMTP session with the domain's mail server, asks whether it would accept the address, and disconnects. It also asks about a random address, which is how catch-all domains are detected.

No email is ever sent. The session ends before any message is transmitted.

## Limits

- A result describes the mailbox at the moment it was checked.
- Some providers refuse to answer verification from cloud networks. Those addresses are returned as `unknown` and are free.
- Servers that require encryption before answering are reported as `unknown`.
- If mailbox checks cannot run at all, the Actor says so in its log, returns those rows as `unknown`, and charges only for domains proven unable to receive mail.
- `deliverable` means the server accepted the address. It does not guarantee that a message will reach the inbox.

## Use it responsibly

Verify lists you are entitled to use, and follow the email and privacy rules that apply to you and your recipients.
