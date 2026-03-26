type DemoJobOutcome = {
  jobId: string;
  state: string;
  result: {
    jobId: string;
    output: unknown;
    executor: string;
    completedAt: number;
  } | null;
};

type WindowWithDemo = Window & {
  demoAgent?: {
    createDemoJob: () => Promise<DemoJobOutcome>;
  };
};

const w = window as WindowWithDemo;

const root = document.getElementById('root');
const jobOut = document.getElementById('job-out');
const btn = document.getElementById('demo-job-btn');

if (root) {
  root.textContent =
    'Machine state is reported from the main process via @local-ai/sdk-ts (LocalAiSdk.reportMachineState).';
}

if (btn && jobOut && w.demoAgent) {
  btn.addEventListener('click', () => {
    jobOut.textContent = 'Creating job…';
    void w.demoAgent!
      .createDemoJob()
      .then((out: DemoJobOutcome) => {
        const lines = [
          `job id: ${out.jobId}`,
          `final state: ${out.state}`,
          out.result != null
            ? `result: ${JSON.stringify(out.result.output)} (executor=${out.result.executor})`
            : 'no result row (job did not complete successfully)',
        ];
        jobOut.textContent = lines.join('\n');
      })
      .catch((e: unknown) => {
        jobOut.textContent = `Error: ${e instanceof Error ? e.message : String(e)}`;
      });
  });
} else if (btn instanceof HTMLButtonElement && jobOut) {
  btn.disabled = true;
  jobOut.textContent = 'demoAgent API unavailable (preload not loaded).';
}
