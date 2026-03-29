import { contextBridge, ipcRenderer } from 'electron';
import type { EmbedTextModelDebugRow, ModelDebugInfo } from '@dyno/sdk-ts';

export type DemoJobOutcome = {
  jobId: string;
  state: string;
  result: {
    jobId: string;
    output: unknown;
    executor: string;
    completedAt: number;
  } | null;
};

export type EmbedWarmupDemoResult = {
  embedText: EmbedTextModelDebugRow;
  modelsBefore: ModelDebugInfo;
  modelsAfter: ModelDebugInfo;
};

contextBridge.exposeInMainWorld('demoAgent', {
  createDemoJob: (): Promise<DemoJobOutcome> => ipcRenderer.invoke('demo:create-demo-job'),
  createEmbeddingJob: (): Promise<DemoJobOutcome> =>
    ipcRenderer.invoke('demo:create-embedding-job'),
  warmupEmbedModel: (): Promise<EmbedWarmupDemoResult> =>
    ipcRenderer.invoke('demo:warmup-embed-model'),
  getModelDebugInfo: (): Promise<ModelDebugInfo> => ipcRenderer.invoke('demo:get-model-debug'),
});
