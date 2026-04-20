const GEMINI_MODEL = 'gemini-embedding-001';
const GEMINI_BASE_URL = 'https://generativelanguage.googleapis.com/v1beta';

function requireValue(value, name) {
  if (!value) {
    throw new Error(`${name} is required.`);
  }
  return value;
}

async function embedWithGemini(texts, config = {}) {
  const apiKey = requireValue(config.apiKey || process.env.GEMINI_API_KEY, 'GEMINI_API_KEY');
  const baseUrl = (config.baseUrl || GEMINI_BASE_URL).replace(/\/+$/, '');

  const vectors = [];
  for (const text of texts) {
    const response = await fetch(`${baseUrl}/models/${GEMINI_MODEL}:embedContent?key=${encodeURIComponent(apiKey)}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json; charset=utf-8',
      },
      body: JSON.stringify({
        model: GEMINI_MODEL,
        contents: text,
      }),
    });
    const raw = await response.text();
    if (!response.ok) {
      throw new Error(`Gemini API returned ${response.status}: ${raw || '(empty body)'}`);
    }
    let payload = null;
    try {
      payload = JSON.parse(raw);
    } catch {
      throw new Error('Gemini API returned invalid JSON payload.');
    }
    const embedding = payload?.embedding?.values;
    if (!Array.isArray(embedding) || !embedding.every((value) => typeof value === 'number')) {
      throw new Error('Gemini response did not include numeric embedding values.');
    }
    vectors.push(embedding);
  }
  return vectors;
}

async function main() {
  const vectors = await embedWithGemini(['old path: hello world']);
  console.log('[old-gemini] embeddings', {
    count: vectors.length,
    dimensions: vectors[0]?.length ?? 0,
  });
}

if (require.main === module) {
  main().catch((error) => {
    console.error('[old-gemini] failed:', error);
    process.exitCode = 1;
  });
}

module.exports = {
  embedWithGemini,
};
