const { Dyno } = require('@dyno/sdk-ts');

function requireValue(value, name) {
  if (!value) {
    throw new Error(`${name} is required.`);
  }
  return value;
}

async function embedWithDyno(texts, config = {}) {
  const initOptions = {
    projectApiKey: requireValue(
      config.projectApiKey || process.env.DYNO_PROJECT_API_KEY || process.env.DYNO_API_KEY,
      'DYNO_PROJECT_API_KEY',
    ),
    fallback: {
      baseUrl: requireValue(config.fallbackBaseUrl || process.env.DYNO_FALLBACK_BASE_URL, 'DYNO_FALLBACK_BASE_URL'),
      apiKey: requireValue(config.fallbackApiKey || process.env.DYNO_FALLBACK_API_KEY, 'DYNO_FALLBACK_API_KEY'),
    },
  };
  if (config.configResolverUrl || process.env.DYNO_CONFIG_RESOLVER_URL) {
    initOptions.configResolverUrl = config.configResolverUrl || process.env.DYNO_CONFIG_RESOLVER_URL;
  }
  if (config.agentBaseUrl) {
    initOptions.agentBaseUrl = config.agentBaseUrl;
  }

  const dyno = await Dyno.init(initOptions);

  try {
    const result = await dyno.embedTexts(texts);
    return {
      vectors: result.results.map((item) => (item.ok ? item.result.embedding : [])),
      batch: result,
      status: await dyno.getStatus(),
    };
  } finally {
    await dyno.shutdown();
  }
}

async function main() {
  const result = await embedWithDyno(['new path: hello world']);
  console.log('[new-dyno] embeddings', {
    count: result.vectors.length,
    dimensions: result.vectors[0]?.length ?? 0,
    runtimeState: result.status.runtime.state,
    runtimeSource: result.status.runtime.runtimeSource,
  });
}

if (require.main === module) {
  main().catch((error) => {
    console.error('[new-dyno] failed:', error);
    process.exitCode = 1;
  });
}

module.exports = {
  embedWithDyno,
};
