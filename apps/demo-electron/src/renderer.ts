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
    createEmbeddingJob: () => Promise<DemoJobOutcome>;
    warmupEmbedModel: () => Promise<{
      embedText: { state: string; loadedAt: number | null; lastError: string | null };
      modelsBefore: { embed_text: { state: string; loadedAt: number | null; lastError: string | null } };
      modelsAfter: { embed_text: { state: string; loadedAt: number | null; lastError: string | null } };
    }>;
    getModelDebugInfo: () => Promise<{
      embed_text: { state: string; loadedAt: number | null; lastError: string | null };
    }>;
  };
};

const w = window as WindowWithDemo;

const root = document.getElementById('root');
const jobOut = document.getElementById('job-out');
const btn = document.getElementById('demo-job-btn');
const embedBtn = document.getElementById('embedding-job-btn');
const warmupBtn = document.getElementById('warmup-embed-btn');

if (root) {
  root.textContent =
    'Machine state is reported from the main process via @dyno/sdk-ts (DynoSdk.reportMachineState).';
}

function formatEmbedOutput(out: DemoJobOutcome): string[] {
  const lines = [`job id: ${out.jobId}`, `final state: ${out.state}`];
  if (out.result == null) {
    lines.push('no result row (job did not complete successfully)');
    return lines;
  }
  const raw = out.result.output;
  if (
    raw !== null &&
    typeof raw === 'object' &&
    !Array.isArray(raw) &&
    (raw as Record<string, unknown>).taskType === 'embed_text'
  ) {
    const o = raw as Record<string, unknown>;
    lines.push(`executor: ${out.result.executor}`);
    lines.push(`dimensions: ${String(o.dimensions)}`);
    lines.push(`embedding preview: ${JSON.stringify(o.embeddingPreview)}`);
    return lines;
  }
  lines.push(
    `result: ${JSON.stringify(out.result.output)} (executor=${out.result.executor})`,
  );
  return lines;
}

if (btn && embedBtn && warmupBtn && jobOut && w.demoAgent) {
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

  embedBtn.addEventListener('click', () => {
    jobOut.textContent = 'Creating embedding job…';
    void w.demoAgent!
      .createEmbeddingJob()
      .then((out: DemoJobOutcome) => {
        jobOut.textContent = formatEmbedOutput(out).join('\n');
      })
      .catch((e: unknown) => {
        jobOut.textContent = `Error: ${e instanceof Error ? e.message : String(e)}`;
      });
  });

  warmupBtn.addEventListener('click', () => {
    jobOut.textContent = 'Warming up embed model…';
    void w
      .demoAgent!.warmupEmbedModel()
      .then((r) => {
        const lines = [
          '--- warmup result (embed_text) ---',
          JSON.stringify(r.embedText, null, 2),
          '--- GET /debug/models before ---',
          JSON.stringify(r.modelsBefore, null, 2),
          '--- GET /debug/models after ---',
          JSON.stringify(r.modelsAfter, null, 2),
        ];
        jobOut.textContent = lines.join('\n');
      })
      .catch((e: unknown) => {
        jobOut.textContent = `Error: ${e instanceof Error ? e.message : String(e)}`;
      });
  });

  void w.demoAgent
    .getModelDebugInfo()
    .then((info) => {
      const pre = document.getElementById('model-debug-line');
      if (pre) {
        pre.textContent = `Current model debug (startup): ${JSON.stringify(info.embed_text)}`;
      }
    })
    .catch(() => {
      const pre = document.getElementById('model-debug-line');
      if (pre) {
        pre.textContent = 'Model debug unavailable (is the agent running?)';
      }
    });
} else if (btn instanceof HTMLButtonElement && jobOut) {
  btn.disabled = true;
  if (embedBtn instanceof HTMLButtonElement) {
    embedBtn.disabled = true;
  }
  if (warmupBtn instanceof HTMLButtonElement) {
    warmupBtn.disabled = true;
  }
  jobOut.textContent = 'demoAgent API unavailable (preload not loaded).';
}
