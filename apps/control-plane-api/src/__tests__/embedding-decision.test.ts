import test from 'node:test';
import assert from 'node:assert/strict';
import { determineEmbeddingExecution } from '../routing/embedding-decision.js';

test('determineEmbeddingExecution prefers local when ready', () => {
  const decision = determineEmbeddingExecution({
    strategyPreset: 'local_first',
    agentReachable: true,
    localReady: true,
  });
  assert.deepEqual(decision, { execution: 'local', reason: 'local_ready' });
});

test('determineEmbeddingExecution falls back when agent unreachable', () => {
  const decision = determineEmbeddingExecution({
    strategyPreset: 'balanced',
    agentReachable: false,
    localReady: false,
  });
  assert.deepEqual(decision, { execution: 'cloud', reason: 'agent_unreachable' });
});

test('determineEmbeddingExecution respects cloud-first strategy', () => {
  const decision = determineEmbeddingExecution({
    strategyPreset: 'cloud_first',
    agentReachable: true,
    localReady: true,
  });
  assert.deepEqual(decision, { execution: 'cloud', reason: 'cloud_preferred' });
});
