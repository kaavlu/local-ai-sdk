import assert from 'node:assert/strict';
import test from 'node:test';
import {
  __resetGenerateTextModelForTests,
  __setGenerateTextPipelineFactoryForTests,
  getGenerateTextModelState,
  getGenerateTextPipeline,
  warmupGenerateTextModel,
  type GenerateTextPipeline,
} from '../models/generate-text-model.js';

function createStubPipeline(output: string): GenerateTextPipeline {
  return async () => [{ generated_text: output }];
}

test('generate_text model first load succeeds and reuses cached pipeline', async () => {
  __resetGenerateTextModelForTests();
  let loads = 0;
  const stub = createStubPipeline('first');
  __setGenerateTextPipelineFactoryForTests(async () => {
    loads += 1;
    return stub;
  });

  try {
    const first = await getGenerateTextPipeline();
    const second = await getGenerateTextPipeline();
    const state = getGenerateTextModelState();
    assert.equal(first, stub);
    assert.equal(second, stub);
    assert.equal(loads, 1);
    assert.equal(state.state, 'ready');
    assert.equal(typeof state.loadedAt, 'number');
    assert.equal(typeof state.lastUsedAt, 'number');
    assert.equal(state.lastError, null);
  } finally {
    __setGenerateTextPipelineFactoryForTests(null);
    __resetGenerateTextModelForTests();
  }
});

test('generate_text warmup is idempotent when model is already ready', async () => {
  __resetGenerateTextModelForTests();
  let loads = 0;
  __setGenerateTextPipelineFactoryForTests(async () => {
    loads += 1;
    return createStubPipeline('warm');
  });

  try {
    const first = await warmupGenerateTextModel();
    const second = await warmupGenerateTextModel();
    assert.equal(first.state, 'ready');
    assert.equal(second.state, 'ready');
    assert.equal(loads, 1);
    assert.equal(typeof second.lastUsedAt, 'number');
  } finally {
    __setGenerateTextPipelineFactoryForTests(null);
    __resetGenerateTextModelForTests();
  }
});
