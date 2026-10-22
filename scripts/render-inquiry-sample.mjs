import fs from 'node:fs';
import { renderInquiryAudit } from '../src/verified-inquiry-report.mjs';
const source = 'artifacts/machiavelli/verified-defects-rehearsal-gated-2026-10-22.json';
const sample = JSON.parse(fs.readFileSync(source, 'utf8'));
const report = renderInquiryAudit({
  sourceClass: 'HISTORICAL_PUBLIC_SITE_REHEARSAL_NOT_LIVE_VALIDATED_NOT_PAYMENT_EVIDENCE',
  title: 'UberBond Website Inquiry Audit | Historical Sample Only',
  approvedWebsite: 'Multiple historical test sites (sample of format, not customer scope)',
  scanAt: '2026-10-22 historical record; precise run-start timestamp UNKNOWN',
  deliveredItems: sample.deliveredItems ?? [], receipt: sample.receipt ?? {},
  pagesExamined: [], unobservableChecks: sample.receipt?.notObservable ?? [],
  questions: ['Intentional call tracking or number routing must be confirmed by the website owner before describing a difference as a defect.'],
  cleanChecks: [],
  deliveryAcceptance: { status: 'NOT REQUESTED: SAMPLE ONLY' }
});
const directory = 'docs/commercialization/samples';
fs.mkdirSync(directory, { recursive: true });
fs.writeFileSync(`${directory}/HISTORICAL_INQUIRY_AUDIT_SAMPLE.md`, report.markdown);
fs.writeFileSync(`${directory}/HISTORICAL_INQUIRY_AUDIT_SAMPLE.html`, report.html);
console.log(JSON.stringify({ source, findingCount: report.findingCount, sourceClass: report.sourceClass }));
