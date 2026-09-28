import test from 'node:test';
import assert from 'node:assert/strict';
import { buildUberReplyV5Message, buildUberReplyV5Subject } from '../src/copy.mjs';

const artifact={
  publicLabel:'one-page revenue-leak evidence map',
  findings:[
    {title:'form confirmation has no visible next-step',evidenceExcerpt:'Thanks, your request has been received.',implication:'the handoff after submission is not visible'},
    {title:'mobile call CTA is absent on the service page',evidenceExcerpt:'Request a quote',implication:'mobile visitors have fewer direct contact routes'}
  ]
};

test('V5 first touch is evidence-first with micro-CTA and short subject',()=>{
  const subject=buildUberReplyV5Subject({offerId:'LEAD_TO_BOOKING_LEAK_AUDIT'});
  assert.equal(subject,'lead handoff');
  assert.ok(subject.split(/\s+/).length>=2&&subject.split(/\s+/).length<=5);
  const body=buildUberReplyV5Message({
    offerId:'LEAD_TO_BOOKING_LEAK_AUDIT',
    prospect:{company:'Example Agency'},
    issue:artifact.findings[0],
    contact:{firstName:'Sam'},
    sender:{name:'Mohamed',company:'UberBond',address:'Cairo'},
    artifact
  });
  assert.match(body,/I checked Example Agency/i);
  assert.match(body,/one-page revenue-leak evidence map/i);
  assert.match(body,/Want me to send it\?/);
  assert.doesNotMatch(body,/book (a|the) call|calendar/i);
});

test('V5 follow-up must add another finding or stop',()=>{
  const body=buildUberReplyV5Message({
    offerId:'LEAD_TO_BOOKING_LEAK_AUDIT',
    prospect:{company:'Example Agency',subject:'lead handoff'},
    issue:artifact.findings[0],
    sender:{name:'Mohamed',company:'UberBond',address:'Cairo'},
    artifact,
    followup:1
  });
  assert.match(body,/one more thing/i);
  assert.match(body,/mobile call CTA/i);
  const stop=buildUberReplyV5Message({
    offerId:'LEAD_TO_BOOKING_LEAK_AUDIT',
    prospect:{company:'Example Agency'},
    issue:artifact.findings[0],
    sender:{name:'Mohamed',company:'UberBond',address:'Cairo'},
    artifact,
    followup:2
  });
  assert.equal(stop,'');
});


test('V5 copy variants change proof density without changing the low-friction ask',()=>{
  const baseArgs={
    offerId:'LEAD_TO_BOOKING_LEAK_AUDIT',
    prospect:{company:'Example Agency'},
    issue:artifact.findings[0],
    contact:{firstName:'Sam'},
    sender:{name:'Mohamed',company:'UberBond',address:'Cairo'},
    artifact
  };
  const base=buildUberReplyV5Message({...baseArgs,variantMode:'BASE'});
  const quote=buildUberReplyV5Message({...baseArgs,variantMode:'QUOTE'});
  const double=buildUberReplyV5Message({...baseArgs,variantMode:'DOUBLE_EVIDENCE'});
  assert.notEqual(base,quote);
  assert.match(quote,/current page says/i);
  assert.match(double,/plus mobile call CTA is absent/i);
  for(const body of [base,quote,double])assert.match(body,/Want me to send it\?/);
});
