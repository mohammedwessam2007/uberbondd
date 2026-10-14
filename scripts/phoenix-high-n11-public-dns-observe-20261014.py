#!/usr/bin/env python3
"""No-send, read-only public DNS observation. Never emits TXT key material."""
import json,subprocess
from datetime import datetime,timezone
DOMAINS=[
 'uberbond.site','uberbondai.shop','uberbondapp.site','uberbondcloud.shop',
 'uberbondconnect.online','uberbondcore.space','uberbondengine.website',
 'uberbondflow.space','uberbondforge.space','uberbondglobal.website']
PILOT='cedarpointdomains.com'
def dig(name,typ,server):
    cmd=['dig','+time=4','+tries=1','+short',name,typ,'@'+server]
    p=subprocess.run(cmd,capture_output=True,text=True,timeout=12)
    if p.returncode: return []
    return [line.strip().replace('"','') for line in p.stdout.splitlines() if line.strip()]
def check(domain,pilot=False,server='1.1.1.1'):
    ns=[v.lower().rstrip('.') for v in dig(domain,'NS',server)]
    mx=[v.lower().rstrip('.') for v in dig(domain,'MX',server)]
    spf=[v.lower() for v in dig(domain,'TXT',server)]
    dkimtxt=dig('dkim._domainkey.'+domain,'TXT',server)
    dkimcn=dig('dkim._domainkey.'+domain,'CNAME',server)
    dmarc=[v.lower() for v in dig('_dmarc.'+domain,'TXT',server)]
    return {
     'domain':domain,
     'ns_both_present':all(n in ns for n in ('ns1.myauto1transport.com','ns2.myauto1transport.com')),
     'mx_inbound_present':any('inbound.'+domain in m for m in mx),
     'spf_present':any('v=spf1' in s and 'include:amazonses.com' in s and '-all' in s for s in spf),
     'dkim_selector_published':bool(dkimtxt or dkimcn),
     'dmarc_expected_policy':any('v=dmarc1' in s and ('p=none' if pilot else 'p=reject') in s for s in dmarc),
     'pilot':pilot
    }
def main():
    for resolver in ['1.1.1.1','8.8.8.8']:
        checks=[check(d,False,resolver) for d in DOMAINS]+[check(PILOT,True,resolver)]
        status={k:sum(bool(row[k]) for row in checks) for k in ('ns_both_present','mx_inbound_present','spf_present','dkim_selector_published','dmarc_expected_policy')}
        print('PHOENIX_N11_PUBLIC_DNS_OBSERVATION:'+json.dumps({
          'utc':datetime.now(timezone.utc).isoformat(),
          'resolver':resolver,'count':len(checks),'statuses':status,
          'checks':checks,
          'actual_message_signature_verified':False,
          'tls_ptr_return_path_verified':False,
          'production_mx_traffic_tested':False,
          'dns_changed':False},sort_keys=True),flush=True)
if __name__=='__main__':main()
