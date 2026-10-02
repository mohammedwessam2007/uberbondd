import { compileOutreachDriftReport } from '../src/outreach-drift-doctor.mjs';
const report = compileOutreachDriftReport();
console.log(JSON.stringify(report, null, 2));
process.exit(report.ok ? 0 : 1);
