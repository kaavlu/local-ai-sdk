const fs = require('node:fs');
const path = require('node:path');

/** Only these workspaces (avoids wiping arbitrary dist/ elsewhere in the tree). */
const PACKAGE_ROOTS = [
  path.join('apps', 'demo-electron'),
  path.join('packages', 'sdk-ts'),
  path.join('packages', 'agent'),
];

function removeDistAt(packageRoot) {
  const p = path.join(process.cwd(), packageRoot, 'dist');
  if (fs.existsSync(p)) {
    fs.rmSync(p, { recursive: true, force: true });
    console.log(`removed ${p}`);
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

for (const rel of PACKAGE_ROOTS) {
  removeDistAt(rel);
  removeTsBuildInfoFiles(path.join(process.cwd(), rel));
}
