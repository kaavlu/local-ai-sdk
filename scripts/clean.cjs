const fs = require('node:fs');
const path = require('node:path');

/** Only these workspaces (avoids wiping arbitrary dist/ elsewhere in the tree). */
const PACKAGE_ROOTS = [
  path.join('apps', 'demo-electron'),
  path.join('packages', 'sdk-ts'),
  path.join('packages', 'agent'),
];

/** Next.js apps — remove `.next` dev/build output. */
const NEXT_APP_ROOTS = [
  path.join('apps', 'website'),
  path.join('apps', 'dashboard-web'),
];

function removeDirIfExists(relDir) {
  const p = path.join(process.cwd(), relDir);
  if (fs.existsSync(p)) {
    fs.rmSync(p, { recursive: true, force: true });
    console.log(`removed ${p}`);
  }
}

function removeDistAt(packageRoot) {
  removeDirIfExists(path.join(packageRoot, 'dist'));
}

function removeNextAt(appRoot) {
  removeDirIfExists(path.join(appRoot, '.next'));
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

/** Monorepo `apps/*` and `packages/*` — strip stray `.tsbuildinfo` (e.g. dashboard-web). */
function cleanWorkspaceTrees() {
  for (const top of ['apps', 'packages']) {
    const topPath = path.join(process.cwd(), top);
    let names;
    try {
      names = fs.readdirSync(topPath, { withFileTypes: true });
    } catch {
      continue;
    }
    for (const e of names) {
      if (!e.isDirectory() || e.name.startsWith('.')) continue;
      removeTsBuildInfoFiles(path.join(topPath, e.name));
    }
  }
}

for (const rel of PACKAGE_ROOTS) {
  removeDistAt(rel);
  removeTsBuildInfoFiles(path.join(process.cwd(), rel));
}

for (const rel of NEXT_APP_ROOTS) {
  removeNextAt(rel);
}

cleanWorkspaceTrees();
