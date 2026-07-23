import test from 'node:test';
import assert from 'node:assert/strict';
import { automationStatus, evaluateAutomationGate, assertAutomationGate, isShadowOnly, AutomationGateError } from '../src/automation/mode.mjs';

const baseCfg = automation => ({ automation });

test('default config resolves to disabled shadow mode', () => {
  const status = automationStatus(baseCfg({}));
  assert.equal(status.mode, 'shadow');
  assert.equal(status.enabled, false);
  assert.equal(status.live, false);
});

test('an unrecognized mode string falls back to shadow rather than failing open', () => {
  const status = automationStatus(baseCfg({ mode: 'yolo', enabled: true }));
  assert.equal(status.mode, 'shadow');
});

test('shadow mode always denies the automation gate even when enabled', () => {
  const result = evaluateAutomationGate(baseCfg({ mode: 'shadow', enabled: true }), { hasActivePolicy: true });
  assert.equal(result.ok, false);
  assert.equal(result.reason, 'shadow-mode-no-external-writes');
});

test('automation-disabled denies the gate regardless of mode', () => {
  const result = evaluateAutomationGate(baseCfg({ mode: 'approval', enabled: false }), { hasActivePolicy: true });
  assert.equal(result.ok, false);
  assert.equal(result.reason, 'automation-disabled');
});

test('approval mode requires an active policy', () => {
  const cfg = baseCfg({ mode: 'approval', enabled: true, campaignPolicyRequired: true });
  assert.equal(evaluateAutomationGate(cfg, { hasActivePolicy: false }).reason, 'no-active-campaign-policy');
  assert.equal(evaluateAutomationGate(cfg, { hasActivePolicy: true }).ok, true);
});

test('autonomous mode additionally requires explicit confirmation', () => {
  const cfg = baseCfg({ mode: 'autonomous', enabled: true, campaignPolicyRequired: true, autonomousConfirmed: false });
  assert.equal(evaluateAutomationGate(cfg, { hasActivePolicy: true }).reason, 'autonomous-not-explicitly-confirmed');
  cfg.automation.autonomousConfirmed = true;
  assert.equal(evaluateAutomationGate(cfg, { hasActivePolicy: true }).ok, true);
});

test('assertAutomationGate throws AutomationGateError on denial', () => {
  assert.throws(() => assertAutomationGate(baseCfg({})), AutomationGateError);
});

test('isShadowOnly is true whenever not live, even in approval mode if disabled', () => {
  assert.equal(isShadowOnly(baseCfg({ mode: 'approval', enabled: false })), true);
  assert.equal(isShadowOnly(baseCfg({ mode: 'approval', enabled: true })), false);
});
