// Delivery and billing rules, kept apart from the Apify SDK so they can be tested.
//
//   - a billable record is delivered and charged in one step (pushCharged);
//   - everything else is delivered free (pushFree);
//   - when the buyer's spending limit is reached, work stops: nothing further is
//     verified, so no result is produced that the buyer did not agree to pay for.
import { summarize, verifyRows } from './verify.mjs';

const STOP = () => Object.assign(new Error('CHARGE_LIMIT'), { code: 'STOP' });

export async function runVerificationSale({ rows, verifyOptions, pushCharged, pushFree, verify = verifyRows }) {
  const delivered = []; let billed = 0; let limitReached = false;
  const onRecord = async rec => {
    if (limitReached) throw STOP();
    if (!rec.definitive) { await pushFree(rec); delivered.push(rec); return; }
    const result = await pushCharged(rec);
    if ((result?.chargedCount ?? 0) >= 1) billed += 1;
    // Under a spending limit Apify stores only what could be charged; treat an unstored record as undelivered.
    if (result?.eventChargeLimitReached && (result?.chargedCount ?? 0) < 1) { limitReached = true; throw STOP(); }
    delivered.push(rec);
    if (result?.eventChargeLimitReached) { limitReached = true; throw STOP(); }
  };
  const { stopped } = await verify(rows, { ...verifyOptions, onRecord });
  return { summary: { ...summarize(delivered), rowsIn: rows.length, rowsNotProcessed: rows.length - delivered.length, billedEvents: billed, stoppedAtSpendingLimit: limitReached || stopped } };
}

// Reads a (possibly nested) field such as "email" or "contact.email"; arrays are flattened.
export function extractEmails(item, field) {
  let values = [item];
  for (const part of String(field).split('.')) values = values.flatMap(v => (v == null ? [] : Array.isArray(v) ? v.map(x => x?.[part]) : [v[part]]));
  return values.flat(3).filter(v => typeof v === 'string' && v.trim()).map(v => v.trim());
}
