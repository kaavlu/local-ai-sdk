import { contextBridge, ipcRenderer } from 'electron';

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

contextBridge.exposeInMainWorld('demoAgent', {
  createDemoJob: (): Promise<DemoJobOutcome> => ipcRenderer.invoke('demo:create-demo-job'),
});
