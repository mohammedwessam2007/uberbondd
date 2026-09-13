#!/usr/bin/env node
import { compileContaboMailCellCandidate, CONTABO_MAIL_PRODUCT } from '../src/contabo-mail-cell.mjs';

const result=compileContaboMailCellCandidate({evidenceRefs:[
  'provider-doc:contabo-api-v1:create-instance-V153',
  'provider-doc:contabo-cloud-vps-4:private-email-server-capable',
  'provider-doc:contabo-vps:static-public-ipv4-included',
  'provider-doc:contabo-rdns:editable-ptr',
  'provider-doc:contabo-network:outbound-unrestricted'
]});
const output={
  ...result,
  operatorMode:'READ_ONLY_CANDIDATE_STATUS',
  product:CONTABO_MAIL_PRODUCT,
  truthBoundary:'This command proves only that a reviewed provider candidate satisfies the software-side shape. It does not prove an account, a quote, credentials, purchase authorization, a running instance, SMTP reachability, PTR, Docker, Postal, DNS, DKIM, reputation or sending authority.'
};
process.stdout.write(`${JSON.stringify(output,null,2)}\n`);
process.exitCode=result.ok?0:2;
