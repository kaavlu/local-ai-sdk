const { embedWithGemini } = require('./old-gemini-embeddings.cjs');
const { embedWithDyno } = require('./new-dyno-embeddings.cjs');

async function main() {
  const input = ['compare old/new path'];
  const oldVectors = await embedWithGemini(input);
  const dynoResult = await embedWithDyno(input);

  console.log('[compare] results', {
    oldCount: oldVectors.length,
    newCount: dynoResult.vectors.length,
    oldDimensions: oldVectors[0]?.length ?? 0,
    newDimensions: dynoResult.vectors[0]?.length ?? 0,
    runtimeState: dynoResult.status.runtime.state,
  });
}

main().catch((error) => {
  console.error('[compare] failed:', error);
  process.exitCode = 1;
});
