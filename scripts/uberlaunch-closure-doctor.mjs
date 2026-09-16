#!/usr/bin/env node
import fs from 'node:fs';
import {UBERDNS_VERSION} from '../src/uberdns-control-plane.mjs';
import {UBERDNS_GODADDY_ADAPTER_VERSION} from '../src/uberdns-godaddy-adapter.mjs';
import {UBERPOSTAL_VERSION} from '../src/uberpostal-identity.mjs';
import {UBERPROSPECT_VERSION} from '../src/uberprospect-forge.mjs';
import {compileUberLaunchClosure,UBERLAUNCH_CLOSURE_VERSION} from '../src/uberlaunch-closure.mjs';

const read=p=>{try{return JSON.parse(fs.readFileSync(p,'utf8'));}catch{return {};}};
const base=process.env.UBERBOND_CONTROL_DIR||'/var/lib/uberbond-control';
const dns=read(`${base}/uberdns-live.json`);
const postal=read(`${base}/uberpostal-identity.json`);
const mailCell=read(`${base}/ubermail-cell.json`);
const prospects=read(`${base}/uberprospect-portfolio.json`);
const runtime=read(`${base}/uberruntime-live.json`);
const result=compileUberLaunchClosure({dns,postal,mailCell,prospects,runtime});
console.log(JSON.stringify({...result,organs:{uberDns:UBERDNS_VERSION,uberDnsGoDaddy:UBERDNS_GODADDY_ADAPTER_VERSION,uberPostal:UBERPOSTAL_VERSION,uberProspect:UBERPROSPECT_VERSION,uberLaunch:UBERLAUNCH_CLOSURE_VERSION},inputs:{dns:Boolean(Object.keys(dns).length),postal:Boolean(Object.keys(postal).length),mailCell:Boolean(Object.keys(mailCell).length),prospects:Boolean(Object.keys(prospects).length),runtime:Boolean(Object.keys(runtime).length)}},null,2));
process.exitCode=result.ok?0:2;
