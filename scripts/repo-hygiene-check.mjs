import { execSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import process from 'node:process';

const root = process.cwd();
const failures = [];

function fail(message) {
  failures.push(message);
  console.error(`[hygiene] FAIL: ${message}`);
}

function pass(message) {
  console.log(`[hygiene] PASS: ${message}`);
}

function read(filePath) {
  return readFileSync(path.join(root, filePath), 'utf8');
}

function checkTrackedGeneratedArtifacts() {
  const allowedTrackedArtifacts = new Set(['packages/sdk-ts/tsconfig.tsbuildinfo']);
  const cmd =
    'git ls-files -- ":(glob)**/.next/**" ":(glob)**/.turbo/**" ":(glob)**/.dyno-agent-data/**" ":(glob)**/dist/**" ":(glob)**/*.tsbuildinfo" "supabase/.temp/**"';
  const output = execSync(cmd, { cwd: root, encoding: 'utf8' })
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
  const unexpected = output.filter((file) => !allowedTrackedArtifacts.has(file));
  if (unexpected.length === 0) {
    pass('No tracked generated artifacts in .next/dist/.temp/tsbuildinfo');
    return;
  }
  fail(`Tracked generated artifacts detected:\n${unexpected.join('\n')}`);
}

function checkScriptCatalogCoverage() {
  const pkg = JSON.parse(read('package.json'));
  const scripts = Object.keys(pkg.scripts ?? {});
  const catalog = read('docs/ops/scripts.md');
  const missing = scripts.filter((name) => !catalog.includes(name));
  if (missing.length === 0) {
    pass('docs/ops/scripts.md references all root npm script names');
    return;
  }
  fail(`Script catalog missing npm script names: ${missing.join(', ')}`);
}

function checkDuplicateToastModule() {
  const duplicatePath = 'apps/dashboard-web/components/ui/use-toast.ts';
  if (!existsSync(path.join(root, duplicatePath))) {
    pass('No duplicate dashboard use-toast module');
    return;
  }
  fail(`Duplicate toast module still exists: ${duplicatePath}`);
}

function checkRequiredOpsDocs() {
  const required = [
    'docs/ops/scripts.md',
    'docs/ops/deprecation-matrix.md',
    'docs/ops/repo-hygiene-checklist.md',
    'docs/archive/legacy-demo-lanes.md',
  ];
  const missing = required.filter((file) => !existsSync(path.join(root, file)));
  if (missing.length === 0) {
    pass('Required cleanup governance docs exist');
    return;
  }
  fail(`Missing governance docs: ${missing.join(', ')}`);
}

try {
  checkTrackedGeneratedArtifacts();
  checkScriptCatalogCoverage();
  checkDuplicateToastModule();
  checkRequiredOpsDocs();
} catch (error) {
  fail(error instanceof Error ? error.message : String(error));
}

if (failures.length > 0) {
  console.error(`\n[hygiene] ${failures.length} check(s) failed`);
  process.exit(1);
}

console.log('\n[hygiene] all checks passed');
