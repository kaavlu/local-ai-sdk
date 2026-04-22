import { contextBridge, ipcRenderer } from 'electron';
import type {
  DemoProjectConfig,
} from '@dynosdk/ts/demo';

type EmbedPurpose = 'index' | 'search';

export type BackendStatus = {
  backendId: 'gemini_cloud' | 'dyno';
  backendLabel: string;
  statusLine: string;
  details: string[];
  runtimeState?: string;
  runtimeLastError?: string | null;
  runtimeSource?: string;
  runtimeVersion?: string | null;
  generationModelState?: 'not_loaded' | 'loading' | 'ready' | 'failed';
  generationWarmupState?: 'idle' | 'warming' | 'ready' | 'failed';
  generationWarmupLastError?: string | null;
  model?: string;
  executionPolicy?: string;
  localMode?: string;
  projectConfig?: Pick<DemoProjectConfig, 'projectId' | 'use_case_type' | 'strategy_preset'>;
};

export type EmbedTextsResponse = {
  count: number;
  dimensions: number;
  vectors: number[][];
};

contextBridge.exposeInMainWorld('demoAgent', {
  getBackendStatus: (): Promise<BackendStatus> => ipcRenderer.invoke('demo:get-backend-status'),
  embedTexts: (payload: {
    texts: string[];
    purpose: EmbedPurpose;
  }): Promise<EmbedTextsResponse> => ipcRenderer.invoke('demo:embed-texts', payload),
});
