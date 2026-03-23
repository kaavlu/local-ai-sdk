const fs = require('node:fs');
const path = require('node:path');

function removeDistDirs(dir) {
  let entries;
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return;
  }
  for (const e of entries) {
    if (e.name === 'node_modules') continue;
    const p = path.join(dir, e.name);
    if (e.isDirectory()) {
      if (e.name === 'dist') {
        fs.rmSync(p, { recursive: true, force: true });
        console.log(`removed ${p}`);
      } else {
        removeDistDirs(p);
      }
    }
  }
}

/** Drop incremental caches so the next `tsc` run re-emits after dist/ is gone. */
function removeTsBuildInfoFiles(dir) {
  let entries;
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return;
  }
  for (const e of entries) {
    if (e.name === 'node_modules') continue;
    const p = path.join(dir, e.name);
    if (e.isDirectory()) {
      removeTsBuildInfoFiles(p);
    } else if (e.name.endsWith('.tsbuildinfo')) {
      fs.rmSync(p, { force: true });
      console.log(`removed ${p}`);
    }
  }
}

removeDistDirs(process.cwd());
removeTsBuildInfoFiles(process.cwd());
