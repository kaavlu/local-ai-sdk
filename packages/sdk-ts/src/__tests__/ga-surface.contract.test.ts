import assert from 'node:assert/strict';
import test from 'node:test';
import { Dyno } from '../dyno.js';

test('Dyno GA surface stays narrow', () => {
  const instanceMethods = new Set(
    Object.getOwnPropertyNames(Dyno.prototype).filter((name) => name !== 'constructor'),
  );

  const expectedGaMethods = ['embedText', 'embedTexts', 'getStatus', 'shutdown'];
  for (const method of expectedGaMethods) {
    assert.equal(instanceMethods.has(method), true, `missing GA method: ${method}`);
  }

  const lowLevelMethodNames = [
    'createJob',
    'waitForJobCompletion',
    'healthCheck',
    'warmupEmbedTextModel',
    'warmupClassifyTextModel',
    'pauseWorker',
    'resumeWorker',
  ];
  for (const method of lowLevelMethodNames) {
    assert.equal(instanceMethods.has(method), false, `unexpected low-level method on Dyno: ${method}`);
  }
});

test('Dyno exposes async init factory', () => {
  assert.equal(typeof Dyno.init, 'function');
});
