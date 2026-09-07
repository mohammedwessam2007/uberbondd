import test from 'node:test';
import assert from 'node:assert/strict';
import {
  compileIntent, consequenceLedger, externalityMap, nonAction,
  intertemporalLockIn, freedomToBecome, COMPILE_STAGES, REVERSIBILITY
} from '../src/intent-compiler.mjs';

// Decisions die in chat windows. That is fixed by making the path from will to
// consequence traceable both ways -- and by refusing to compile past the one
// stage where being able to do a thing gets confused with being allowed to.

const authority = { ok: true, status: 'AUTHORITY_GRANTED' };

test('compilation stops at permissions without authority', () => {
  const stopped = compileIntent({
    will: 'move to Lisbon', plan: 'find work, then a flat',
    capabilities: ['portuguese'], resources: ['savings']
  });
  assert.equal(stopped.status, 'COMPILATION_STOPPED');
  assert.equal(stopped.stoppedAt, 'PERMISSIONS');
  assert.ok(stopped.blockers.includes('no-authority'));
});

test('reaching permissions is not permission to act', () => {
  // The pipeline sits downstream of that boundary; a ready plan is still not
  // an authorized one.
  const ready = compileIntent({
    will: 'x', plan: 'y', capabilities: ['a'], resources: ['b'], authority
  });
  assert.equal(ready.status, 'READY_FOR_ACTION');
  assert.equal(ready.businessEffectAuthority, 'NONE');
  assert.match(ready.boundary, /EXECUTION IS SOMEONE ELSES CALL/);
});

test('stopping names the stage, because a silent assumption is the failure', () => {
  const noPlan = compileIntent({ will: 'x' });
  assert.equal(noPlan.stoppedAt, 'PLAN');
  assert.ok(noPlan.blockers.includes('no-plan'));

  const noCapabilities = compileIntent({ will: 'x', plan: 'y' });
  assert.equal(noCapabilities.stoppedAt, 'CAPABILITIES');

  const noResources = compileIntent({ will: 'x', plan: 'y', capabilities: ['a'] });
  assert.equal(noResources.stoppedAt, 'RESOURCES');
  assert.deepEqual(COMPILE_STAGES.slice(0, 2), ['WILL', 'INTENT']);
});

test('the unpredicted column is the one that teaches', () => {
  // A ledger holding only what was intended is a record of hopes.
  const reconciled = consequenceLedger({
    action: 'took the job',
    predicted: ['more income', 'less free time'],
    observed: ['more income', 'lost touch with two friends']
  });
  assert.deepEqual(reconciled.unpredicted, ['lost touch with two friends']);
  assert.deepEqual(reconciled.predictedButAbsent, ['less free time']);
  assert.match(reconciled.learning, /where the model was wrong/);
});

test('an empty unpredicted column carries its own caveat', () => {
  const reconciled = consequenceLedger({ action: 'x', predicted: ['a'], observed: ['a'] });
  assert.match(reconciled.learning, /or that nobody looked/);
});

test('effects on other people without recorded consent are named', () => {
  const mapped = externalityMap({
    decision: 'move abroad',
    effects: [
      { party: 'FOUNDER', effect: 'new city', reversibility: 'COSTLY_TO_REVERSE' },
      { party: 'RELATIONSHIPS', effect: 'distance from family', reversibility: 'PATH_DEPENDENT' },
      { party: 'OTHER_PEOPLE', effect: 'a friend loses their flatmate', reversibility: 'REVERSIBLE', consented: true }
    ]
  });
  assert.equal(mapped.onOthers, 2);
  assert.deepEqual(mapped.withoutRecordedConsent.map(row => row.party), ['RELATIONSHIPS']);
  assert.match(mapped.boundary, /WHAT IS OWED TO THEM IS NOT A COMPUTATION/);
});

test('irreversible effects on other people are surfaced separately', () => {
  const mapped = externalityMap({
    decision: 'x',
    effects: [{ party: 'FUTURE_PERSONS', effect: 'a debt they inherit', reversibility: 'PRACTICALLY_IRREVERSIBLE' }]
  });
  assert.equal(mapped.irreversibleOnOthers.length, 1);
});

test('waiting is priced as an option, not treated as the absence of one', () => {
  const cheap = nonAction({ decision: 'x', informationGained: 8, optionDecay: 2 });
  assert.equal(cheap.status, 'WAITING_BUYS_MORE_THAN_IT_COSTS');

  const expensive = nonAction({ decision: 'x', informationGained: 2, optionDecay: 9, windowClosesIn: 'six weeks' });
  assert.equal(expensive.status, 'WAITING_COSTS_MORE_THAN_IT_BUYS');
  assert.match(expensive.note, /the window closes in six weeks/);
});

test('an accumulated constraint is told apart from a chosen commitment', () => {
  // Both close futures. Only one was decided, and a system that cannot tell
  // them apart lets a life narrow with nobody noticing.
  const accidental = intertemporalLockIn({
    commitment: 'the mortgage plus the specialisation',
    reversibility: 'PRACTICALLY_IRREVERSIBLE',
    futuresClosed: ['moving abroad', 'changing field']
  });
  assert.equal(accidental.status, 'ACCIDENTAL_SELF_CAPTURE');
  assert.match(accidental.distinction, /without anyone having decided to/);

  const chosen = intertemporalLockIn({
    commitment: 'marriage', reversibility: 'PRACTICALLY_IRREVERSIBLE', chosenDeliberately: true
  });
  assert.equal(chosen.status, 'LOCK_IN_RECORDED');
  assert.match(chosen.distinction, /Closing futures is what commitment does/);
});

test('a reversible lock-in is not self-capture however many futures it touches', () => {
  const light = intertemporalLockIn({
    commitment: 'a six-month lease', reversibility: 'REVERSIBLE',
    futuresClosed: ['a', 'b', 'c', 'd']
  });
  assert.equal(light.status, 'LOCK_IN_RECORDED');
  assert.ok(REVERSIBILITY.includes('PHYSICALLY_IRREVERSIBLE'));
});

test('freedom to become asks rather than scores', () => {
  // An identity nobody has imagined cannot be counted, so a score here would
  // be counting the identities the present self already thought of.
  const asked = freedomToBecome({ decision: 'x', preservesCapacityToChange: false });
  assert.equal(asked.status, 'FORECLOSES_BECOMING');
  assert.match(asked.boundary, /ASKS RATHER THAN SCORES/);
  assert.equal(Object.hasOwn(asked, 'score'), false);
});
