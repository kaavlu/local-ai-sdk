import assert from 'node:assert/strict';
import test from 'node:test';
import {
  __resetWorkloadModelRuntimeForTests,
  __setLocalWorkloadExecutionTimeoutMsForTests,
  __setWorkloadModelAdaptersForTests,
  getLocalWorkloadExecutionTimeoutMs,
  prepareWorkloadModelAccessForTask,
  runWithLocalWorkloadTimeout,
} from '../models/workload-model-runtime.js';

interface MockModelState {
  state: string;
  loadedAt: number | null;
  lastUsedAt: number | null;
  lastError: string | null;
}

function makeAdapter(initial: MockModelState): {
  state: MockModelState;
  unloadCount: number;
  adapter: {
    getState: () => MockModelState;
    unload: () => void;
  };
} {
  let state = { ...initial };
  let unloadCount = 0;
  return {
    get state() {
      return state;
    },
    get unloadCount() {
      return unloadCount;
    },
    adapter: {
      getState: () => ({ ...state }),
      unload: () => {
        unloadCount += 1;
        state = { state: 'not_loaded', loadedAt: null, lastUsedAt: null, lastError: null };
      },
    },
  };
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

test('runWithLocalWorkloadTimeout fails fast for generate_text timeout', async () => {
  __resetWorkloadModelRuntimeForTests();
  __setLocalWorkloadExecutionTimeoutMsForTests('generate_text', 10);

  try {
    assert.equal(getLocalWorkloadExecutionTimeoutMs('generate_text'), 10);
    await assert.rejects(
      runWithLocalWorkloadTimeout('generate_text', async () => {
        await sleep(40);
        return 'done';
      }),
      /generate_text execution timed out after 10ms/,
    );
  } finally {
    __resetWorkloadModelRuntimeForTests();
  }
});

test('prepareWorkloadModelAccessForTask evicts least recently used model when loading generate_text', () => {
  __resetWorkloadModelRuntimeForTests();
  const now = Date.now();
  const embed = makeAdapter({
    state: 'ready',
    loadedAt: now - 2_000,
    lastUsedAt: now - 2_000,
    lastError: null,
  });
  const classify = makeAdapter({
    state: 'ready',
    loadedAt: now - 1_000,
    lastUsedAt: now - 1_000,
    lastError: null,
  });
  const generate = makeAdapter({
    state: 'not_loaded',
    loadedAt: null,
    lastUsedAt: null,
    lastError: null,
  });

  try {
    __setWorkloadModelAdaptersForTests({
      embed_text: embed.adapter,
      classify_text: classify.adapter,
      generate_text: generate.adapter,
    });

    prepareWorkloadModelAccessForTask('generate_text');

    assert.equal(embed.unloadCount, 1);
    assert.equal(classify.unloadCount, 0);
    assert.equal(generate.unloadCount, 0);
  } finally {
    __resetWorkloadModelRuntimeForTests();
  }
});
