import test from 'node:test';
import assert from 'node:assert/strict';
import { classifyUberReply, normalizeAiReplyClassification } from '../src/uberreply-taxonomy.mjs';

const cases=[
 ['Please remove me from this list','optout'],
 ['I am out of office until October 4','out_of_office'],
 ['You have the wrong person, I do not handle this','wrong_person'],
 ['Looping in Sarah who handles this','referral'],
 ['Too expensive for us right now','objection'],
 ['Yes, send me the outline','positive'],
 ['No thanks, not interested','negative'],
 ['This is an automated response','automatic']
];
for(const [body,label] of cases)test(`classifies ${label}`,()=>assert.equal(classifyUberReply(body).label,label));
test('optout recommends suppression and a positive reply does not',()=>{
 assert.equal(classifyUberReply('unsubscribe').suppressionRecommended,true);
 assert.equal(classifyUberReply('yes interested').suppressionRecommended,false);
});
test('AI labels are normalized into the bounded taxonomy',()=>{
 assert.equal(normalizeAiReplyClassification({label:'wrong-person',confidence:2}).label,'wrong_person');
 assert.equal(normalizeAiReplyClassification({label:'made-up'}).label,'neutral');
});
