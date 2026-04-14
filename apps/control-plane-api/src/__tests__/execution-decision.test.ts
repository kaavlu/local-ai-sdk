import test from 'node:test';
import assert from 'node:assert/strict';
import { determineExecution } from '../routing/execution-decision.js';

test('determineExecution forces cloud for chat', () => {
  const decision = determineExecution({
    useCase: 'chat',
    strategyPreset: 'local_first',
    agentReachable: true,
    localReady: true,
  });
  assert.deepEqual(decision, { execution: 'cloud', reason: 'local_not_supported' });
});
