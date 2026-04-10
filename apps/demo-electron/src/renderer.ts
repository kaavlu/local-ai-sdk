type SampleDataset = {
  id: string;
  label: string;
  description: string;
  documents: string[];
};

const SAMPLE_DATASETS: SampleDataset[] = [
  {
    id: 'support-notes',
    label: 'Customer Support Notes',
    description: 'Recent support tickets around login, billing, and exports.',
    documents: [
      'Ticket #1482: Customer cannot reset password from mobile. Email arrives but reset link opens a blank page when tapped from iOS Mail.',
      'Ticket #1494: Billing admin says invoice PDF exports fail for accounts with more than 50 seats. CSV export succeeds.',
      'Ticket #1501: User asks for a way to filter alerts by team. They currently receive all workspace alerts in one stream.',
      'Ticket #1508: Customer reports API token rotation worked, but old token still appears in audit log as active for about 30 seconds.',
      'Ticket #1512: Enterprise customer requests SSO login troubleshooting guide for onboarding new IT admins.',
    ],
  },
  {
    id: 'product-meetings',
    label: 'Product Meeting Notes',
    description: 'Planning notes from roadmap and release check-ins.',
    documents: [
      'Roadmap sync: Prioritize semantic search in admin dashboard. PM wants first pass focused on internal docs and support notes.',
      'Release prep: Keep new onboarding wizard behind feature flag until analytics confirms completion rate improvement.',
      'Engineering standup: Background indexing pipeline needs better progress telemetry before opening beta.',
      'Design review: Compact dark theme approved for desktop tools, reduce vertical spacing in form controls by 20 percent.',
      'Go-to-market meeting: Prepare demo that contrasts cloud inference with local/Dyno path using same UI and same query workflow.',
    ],
  },
  {
    id: 'internal-docs',
    label: 'Internal Documentation Snippets',
    description: 'Operational notes and developer-facing internal docs.',
    documents: [
      'Runbook: If worker queue stalls, verify readiness endpoint and ensure machine state reports continue every 5 seconds.',
      'API note: Embedding requests should include project context in Dyno mode to enforce strategy preset scheduling.',
      'Developer guide: For local model warm starts, execute a warmup embedding after agent startup before performance measurements.',
      'Security note: Service-role keys must stay in local environment variables and never be bundled in renderer code.',
      'Architecture note: Keep embedding provider switch centralized in main process to avoid split code paths in renderer.',
    ],
  },
  {
    id: 'user-feedback',
    label: 'User Feedback Entries',
    description: 'Direct product feedback from power users.',
    documents: [
      'Feedback: Search results are accurate, but users want to see similarity scores to understand why a result ranked first.',
      'Feedback: Desktop demo should clearly state which backend is active so team members can verify mode quickly.',
      'Feedback: Index button should process sample content immediately without setup friction for live demos.',
      'Feedback: Query latency feels acceptable under one second for small document collections.',
      'Feedback: Please avoid flashy gradients; we prefer compact and serious visuals for internal tooling.',
    ],
  },
];

type EmbedPurpose = 'index' | 'search';

type BackendStatus = {
  backendId: 'gemini_cloud' | 'dyno';
  backendLabel: string;
  statusLine: string;
  details: string[];
  model?: string;
  executionPolicy?: string;
  localMode?: string;
  projectConfig?: {
    projectId: string;
    use_case_type: string;
    strategy_preset: string;
  };
};

type WindowWithDemo = Window & {
  demoAgent?: {
    getBackendStatus: () => Promise<BackendStatus>;
    embedTexts: (payload: { texts: string[]; purpose: EmbedPurpose }) => Promise<{
      count: number;
      dimensions: number;
      vectors: number[][];
    }>;
  };
};

type IndexedChunk = {
  text: string;
  vector: number[];
  noteLabel: string;
  noteOrder: number;
};

type SourceResolution = {
  mode: 'dataset' | 'custom';
  dataset: SampleDataset;
  documents: string[];
};

type RankedResult = {
  rank: number;
  text: string;
  score: number;
  noteLabel: string;
};

const w = window as WindowWithDemo;

const backendName = document.getElementById('backend-name');
const backendBadge = document.getElementById('backend-badge');
const backendStatus = document.getElementById('backend-status');
const backendSummary = document.getElementById('backend-summary');
const backendDetails = document.getElementById('backend-details');
const integrationStatus = document.getElementById('integration-status');
const sdkSnippet = document.getElementById('sdk-snippet');
const lifecycleList = document.getElementById('lifecycle-list');
const statusLog = document.getElementById('status-log');
const datasetDescription = document.getElementById('dataset-description');
const datasetCount = document.getElementById('dataset-count');
const sourceMode = document.getElementById('source-mode');
const previewList = document.getElementById('preview-list');
const previewCount = document.getElementById('preview-count');
const suggestions = document.getElementById('suggestions');
const datasetSelect = document.getElementById('dataset-select') as HTMLSelectElement | null;
const customText = document.getElementById('custom-text') as HTMLTextAreaElement | null;
const indexBtn = document.getElementById('index-btn') as HTMLButtonElement | null;
const indexedSummary = document.getElementById('indexed-summary');
const queryInput = document.getElementById('query-input') as HTMLInputElement | null;
const searchBtn = document.getElementById('search-btn') as HTMLButtonElement | null;
const resultsPanel = document.getElementById('results-panel');

let activeBackend: BackendStatus | null = null;
let indexedChunks: IndexedChunk[] = [];
let indexingInProgress = false;
let searchInProgress = false;
let lastIndexedQuery = '';

function setStatusLog(message: string, tone: 'normal' | 'warn' = 'normal'): void {
  if (statusLog) {
    statusLog.textContent = message;
    statusLog.classList.toggle('status-line-warn', tone === 'warn');
  }
}

function escapeHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

function cosineSimilarity(a: number[], b: number[]): number {
  if (a.length === 0 || a.length !== b.length) {
    return 0;
  }
  let dot = 0;
  let magA = 0;
  let magB = 0;
  for (let i = 0; i < a.length; i += 1) {
    dot += a[i] * b[i];
    magA += a[i] * a[i];
    magB += b[i] * b[i];
  }
  if (magA === 0 || magB === 0) {
    return 0;
  }
  return dot / (Math.sqrt(magA) * Math.sqrt(magB));
}

function splitIntoChunks(text: string, maxChunkLength = 320): string[] {
  const parts = text
    .split(/(?<=[.!?])\s+|\n+/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0);
  const chunks: string[] = [];
  let current = '';
  for (const part of parts) {
    const candidate = current.length > 0 ? `${current} ${part}` : part;
    if (candidate.length <= maxChunkLength) {
      current = candidate;
      continue;
    }
    if (current.length > 0) {
      chunks.push(current);
    }
    current = part;
  }
  if (current.length > 0) {
    chunks.push(current);
  }
  return chunks;
}

function truncateText(value: string, maxLength: number): string {
  if (value.length <= maxLength) {
    return value;
  }
  return `${value.slice(0, maxLength - 1).trimEnd()}...`;
}

function inferNoteLabel(text: string, index: number): string {
  const marker = text.indexOf(':');
  if (marker > 0) {
    return truncateText(text.slice(0, marker).trim(), 56);
  }
  return `Note ${index + 1}`;
}

function sentenceCase(value: string): string {
  return value
    .replaceAll('_', ' ')
    .split(' ')
    .filter(Boolean)
    .map((token, index) =>
      index === 0 ? token.charAt(0).toUpperCase() + token.slice(1) : token.toLowerCase(),
    )
    .join(' ');
}

function formatExecutionLabel(status: BackendStatus): string | null {
  if (!status.executionPolicy || !status.localMode) {
    return null;
  }
  return `${sentenceCase(status.executionPolicy)} / ${sentenceCase(status.localMode)}`;
}

function setBusyState(): void {
  const busy = indexingInProgress || searchInProgress;
  if (indexBtn) {
    indexBtn.disabled = busy;
  }
  if (searchBtn) {
    searchBtn.disabled = busy;
  }
  if (indexBtn) {
    indexBtn.textContent = indexingInProgress ? 'Building Index...' : 'Build Semantic Index';
  }
  if (searchBtn) {
    searchBtn.textContent = searchInProgress ? 'Searching...' : 'Run Search';
  }
}

function getSelectedDataset(): SampleDataset {
  const selectedId = datasetSelect?.value ?? SAMPLE_DATASETS[0].id;
  return SAMPLE_DATASETS.find((set) => set.id === selectedId) ?? SAMPLE_DATASETS[0];
}

function getSourceResolution(): SourceResolution {
  const custom = customText?.value.trim() ?? '';
  const dataset = getSelectedDataset();
  if (custom.length > 0) {
    return {
      mode: 'custom',
      dataset,
      documents: custom
        .split(/\n{2,}/)
        .map((part) => part.trim())
        .filter((part) => part.length > 0),
    };
  }
  return {
    mode: 'dataset',
    dataset,
    documents: dataset.documents,
  };
}

function getSuggestionsForSource(source: SourceResolution): string[] {
  if (source.mode === 'custom') {
    return [
      'Summarize recurring themes in these notes',
      'Which note mentions troubleshooting guidance?',
      'What item is most related to performance concerns?',
    ];
  }
  const byDataset: Record<string, string[]> = {
    'support-notes': [
      'Which ticket mentions billing export issues?',
      'What note references SSO onboarding?',
      'Find login reset problems reported on mobile',
    ],
    'product-meetings': [
      'What did the team decide about feature flags?',
      'Which note discusses telemetry before beta?',
      'Find the meeting note about cloud vs local demo',
    ],
    'internal-docs': [
      'Which runbook note mentions readiness checks?',
      'Find guidance about service-role key handling',
      'What document mentions project context in Dyno mode?',
    ],
    'user-feedback': [
      'What feedback asks for visible similarity scores?',
      'Find notes about backend mode clarity in the UI',
      'Which feedback discusses search latency?',
    ],
  };
  return byDataset[source.dataset.id] ?? ['Find the most relevant note for my query'];
}

function renderSuggestions(items: string[]): void {
  if (!suggestions) {
    return;
  }
  suggestions.innerHTML = items
    .map(
      (item) =>
        `<button type="button" class="suggestion-btn" data-query="${escapeHtml(item)}">${escapeHtml(item)}</button>`,
    )
    .join('');
}

function renderSourcePreview(source: SourceResolution): void {
  if (datasetDescription) {
    datasetDescription.textContent = source.dataset.description;
  }
  if (datasetCount) {
    datasetCount.textContent = `${source.dataset.documents.length} built-in notes`;
  }
  if (sourceMode) {
    const isCustom = source.mode === 'custom';
    sourceMode.innerHTML = [
      `<span class="chip ${isCustom ? '' : 'chip-active'}">Built-in dataset</span>`,
      `<span class="chip ${isCustom ? 'chip-active' : ''}">Custom notes</span>`,
    ].join('');
  }
  if (previewCount) {
    previewCount.textContent = `${source.documents.length} notes selected`;
  }
  if (!previewList) {
    return;
  }
  if (source.documents.length === 0) {
    previewList.innerHTML = '<li class="empty">Add custom notes or select a built-in dataset to continue.</li>';
    return;
  }
  previewList.innerHTML = source.documents
    .slice(0, 8)
    .map((doc, index) => {
      const title = inferNoteLabel(doc, index);
      return `
        <li class="preview-item">
          <div class="preview-item-header">
            <p class="preview-title">${escapeHtml(title)}</p>
            <p class="preview-length">${doc.length} chars</p>
          </div>
          <p class="preview-text">${escapeHtml(truncateText(doc, 140))}</p>
        </li>
      `;
    })
    .join('');
}

function refreshSourceWorkspace(): void {
  const source = getSourceResolution();
  renderSourcePreview(source);
  renderSuggestions(getSuggestionsForSource(source));
}

function renderBackendStatus(status: BackendStatus): void {
  if (backendName) {
    backendName.textContent = status.backendLabel;
  }
  if (backendBadge) {
    backendBadge.textContent = status.backendId === 'dyno' ? 'Dyno mode' : 'Gemini Cloud mode';
  }
  if (backendStatus) {
    backendStatus.textContent =
      status.backendId === 'dyno'
        ? 'Dyno project config resolved. Ready for semantic indexing.'
        : 'Gemini Cloud is active. Ready for semantic indexing.';
  }
  if (integrationStatus) {
    integrationStatus.textContent = status.statusLine;
  }
  if (backendSummary) {
    const summaryLines: string[] = [];
    if (status.projectConfig) {
      summaryLines.push(`Project: ${status.projectConfig.projectId}`);
      summaryLines.push(`Strategy: ${sentenceCase(status.projectConfig.strategy_preset)}`);
    } else {
      summaryLines.push('Project: Demo default');
      summaryLines.push(`Model: ${status.model ?? 'gemini-embedding-001'}`);
    }
    summaryLines.push(`Status: ${status.statusLine}`);
    const execution = formatExecutionLabel(status);
    if (execution) {
      summaryLines.push(`Execution target: ${execution}`);
    }
    backendSummary.innerHTML = summaryLines.map((line) => `<li>${escapeHtml(line)}</li>`).join('');
  }
  if (backendDetails) {
    backendDetails.innerHTML = status.details.map((detail) => `<li>${escapeHtml(detail)}</li>`).join('');
  }
  if (sdkSnippet) {
    if (status.backendId === 'dyno') {
      const projectId = status.projectConfig?.projectId ?? '<project-id>';
      sdkSnippet.textContent = [
        'SDK flow',
        `createDemoProjectSdkContext({ projectId: "${projectId}" })`,
        'deriveSchedulingFromDemoProject(projectConfig)',
        'sdk.createJob({ taskType: "embed_text", executionPolicy, localMode })',
      ].join('\n');
    } else {
      sdkSnippet.textContent = [
        'Cloud flow',
        `GoogleGenAI.models.embedContent({ model: "${status.model ?? 'gemini-embedding-001'}" })`,
        'No Dyno project resolver required in this mode',
      ].join('\n');
    }
  }
}

function renderLifecycle(): void {
  if (!lifecycleList) {
    return;
  }
  const rows: Array<{ complete: boolean; label: string }> = [
    {
      complete: activeBackend !== null,
      label:
        activeBackend?.backendId === 'dyno'
          ? 'Config resolved from Dyno project settings'
          : 'Cloud model configured and ready',
    },
    {
      complete: indexedChunks.length > 0,
      label:
        indexedChunks.length > 0
          ? `Semantic index built (${indexedChunks.length} chunks)`
          : 'Semantic index not built yet',
    },
    {
      complete: indexedChunks.length > 0,
      label: indexedChunks.length > 0 ? 'Search workspace ready' : 'Build index to enable search',
    },
  ];
  lifecycleList.innerHTML = rows
    .map(
      (row) =>
        `<li><span class="lifecycle-dot ${row.complete ? 'lifecycle-dot-active' : ''}"></span>${escapeHtml(row.label)}</li>`,
    )
    .join('');
}

function renderResults(rows: RankedResult[]): void {
  if (!resultsPanel) {
    return;
  }
  if (rows.length === 0) {
    if (indexedChunks.length === 0) {
      resultsPanel.innerHTML =
        '<div class="empty">Build a semantic index first. Then run search to see ranked note matches.</div>';
      return;
    }
    resultsPanel.innerHTML =
      '<div class="empty">Index is ready. Enter a search query or click one of the suggested prompts.</div>';
    return;
  }
  const headline = lastIndexedQuery
    ? `Top semantic matches for "${escapeHtml(lastIndexedQuery)}"`
    : 'Top semantic matches';
  const backendLine = activeBackend ? activeBackend.backendLabel : 'Active backend';
  resultsPanel.innerHTML = rows
    .map(
      (row) => `
      <article class="result-row">
        <header class="result-header">
          <span class="result-rank">Rank #${row.rank}</span>
          <span class="result-score">Similarity ${row.score.toFixed(3)}</span>
        </header>
        <p class="result-title">${escapeHtml(row.noteLabel)}</p>
        <p class="result-text">${escapeHtml(row.text)}</p>
        <div class="result-meta">Embedded and ranked via ${escapeHtml(backendLine)}</div>
      </article>
    `,
    )
    .join('');
  resultsPanel.innerHTML = `<p class="results-headline">${headline}</p>${resultsPanel.innerHTML}`;
}

async function refreshBackendStatus(): Promise<void> {
  if (!w.demoAgent) {
    throw new Error('demoAgent API unavailable (preload not loaded).');
  }
  activeBackend = await w.demoAgent.getBackendStatus();
  renderBackendStatus(activeBackend);
  renderLifecycle();
}

function setupDatasetSelector(): void {
  if (!datasetSelect) {
    return;
  }
  datasetSelect.innerHTML = SAMPLE_DATASETS.map((dataset) => `<option value="${dataset.id}">${escapeHtml(dataset.label)}</option>`).join('');
  datasetSelect.value = SAMPLE_DATASETS[0].id;
  datasetSelect.addEventListener('change', refreshSourceWorkspace);
}

function setupCustomTextListener(): void {
  if (!customText) {
    return;
  }
  customText.addEventListener('input', refreshSourceWorkspace);
}

function setupSuggestions(): void {
  if (!suggestions) {
    return;
  }
  suggestions.addEventListener('click', (event) => {
    const target = event.target as HTMLElement | null;
    if (!target || !target.matches('button[data-query]')) {
      return;
    }
    const query = target.getAttribute('data-query');
    if (!query || !queryInput) {
      return;
    }
    queryInput.value = query;
    queryInput.focus();
  });
}

async function runIndexing(): Promise<void> {
  if (!w.demoAgent) {
    throw new Error('demoAgent API unavailable (preload not loaded).');
  }
  const source = getSourceResolution();
  const chunks = source.documents.flatMap((doc, documentIndex) => {
    const noteLabel = inferNoteLabel(doc, documentIndex);
    return splitIntoChunks(doc).map((chunk) => ({
      text: chunk,
      noteLabel,
      noteOrder: documentIndex + 1,
    }));
  });
  if (chunks.length === 0) {
    throw new Error('No documents to index. Select a sample set or paste custom text.');
  }
  indexingInProgress = true;
  setBusyState();
  setStatusLog(`Building semantic index from ${source.documents.length} notes...`);
  if (indexedSummary) {
    indexedSummary.textContent = `Indexing ${chunks.length} chunks...`;
  }
  renderLifecycle();
  try {
    const response = await w.demoAgent.embedTexts({
      texts: chunks.map((chunk) => chunk.text),
      purpose: 'index',
    });
    indexedChunks = chunks.map((chunk, idx) => ({
      text: chunk.text,
      noteLabel: chunk.noteLabel,
      noteOrder: chunk.noteOrder,
      vector: response.vectors[idx],
    }));
    if (indexedSummary) {
      const summaryParts = [
        `Indexed ${indexedChunks.length} chunks from ${source.documents.length} notes`,
        `Using ${activeBackend?.backendLabel ?? 'Unknown backend'}`,
      ];
      const execution = activeBackend ? formatExecutionLabel(activeBackend) : null;
      if (activeBackend?.backendId === 'dyno' && execution) {
        summaryParts.push(`Execution ${execution}`);
      }
      indexedSummary.textContent = summaryParts.join(' | ');
    }
    renderResults([]);
    renderLifecycle();
    if (activeBackend?.backendId === 'dyno') {
      setStatusLog(`Indexed ${indexedChunks.length} chunks using Dyno. Ready to search.`);
    } else {
      setStatusLog(`Indexed ${indexedChunks.length} chunks using Gemini Cloud. Ready to search.`);
    }
  } catch (error: unknown) {
    if (indexedSummary) {
      indexedSummary.textContent = `Indexing failed: ${error instanceof Error ? error.message : String(error)}`;
    }
    renderLifecycle();
    throw error;
  } finally {
    indexingInProgress = false;
    setBusyState();
  }
}

async function runSearch(): Promise<void> {
  if (!w.demoAgent) {
    throw new Error('demoAgent API unavailable (preload not loaded).');
  }
  if (indexedChunks.length === 0) {
    throw new Error('Index documents before searching.');
  }
  const query = queryInput?.value.trim() ?? '';
  if (!query) {
    throw new Error('Enter a search query.');
  }
  searchInProgress = true;
  setBusyState();
  setStatusLog('Running semantic search...');
  try {
    const response = await w.demoAgent.embedTexts({ texts: [query], purpose: 'search' });
    const queryVector = response.vectors[0];
    const ranked = indexedChunks
      .map((entry) => ({
        text: entry.text,
        noteLabel: entry.noteLabel,
        score: cosineSimilarity(queryVector, entry.vector),
      }))
      .sort((a, b) => b.score - a.score)
      .slice(0, 6)
      .map((entry, index) => ({
        rank: index + 1,
        text: entry.text,
        noteLabel: entry.noteLabel,
        score: entry.score,
      }));
    lastIndexedQuery = query;
    renderResults(ranked);
    setStatusLog(
      `Search complete on ${activeBackend?.backendLabel ?? 'the active backend'}. Showing ranked semantic matches.`,
    );
  } finally {
    searchInProgress = false;
    setBusyState();
  }
}

async function boot(): Promise<void> {
  setupDatasetSelector();
  setupCustomTextListener();
  setupSuggestions();
  refreshSourceWorkspace();
  renderResults([]);
  renderLifecycle();
  await refreshBackendStatus();
  if (activeBackend?.backendId === 'dyno') {
    setStatusLog(
      'Ready in Dyno mode. Build the index to run project-configured embedding jobs.',
    );
  } else {
    setStatusLog('Ready in Gemini Cloud mode. Build the index to begin semantic search.');
  }
}

if (indexBtn && searchBtn) {
  indexBtn.addEventListener('click', () => {
    void runIndexing().catch((error: unknown) => {
      setStatusLog(`Error: ${error instanceof Error ? error.message : String(error)}`, 'warn');
    });
  });
  searchBtn.addEventListener('click', () => {
    void runSearch().catch((error: unknown) => {
      setStatusLog(`Error: ${error instanceof Error ? error.message : String(error)}`, 'warn');
    });
  });
  void boot().catch((error: unknown) => {
    setStatusLog(`Error: ${error instanceof Error ? error.message : String(error)}`, 'warn');
  });
}
