#!/usr/bin/env node

import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(scriptDir, '..');

const rawVersion = process.argv[2] ?? process.env.RELEASE_VERSION ?? process.env.GITHUB_REF_NAME;
if (!rawVersion) {
  throw new Error(
    'Missing release version. Pass a version or set RELEASE_VERSION/GITHUB_REF_NAME.',
  );
}

const version = rawVersion.replace(/^refs\/tags\//, '').replace(/^v/, '');
if (!/^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?(?:\+[0-9A-Za-z.-]+)?$/.test(version)) {
  throw new Error(
    `Invalid release version "${rawVersion}". Expected a semantic version like v0.11.0.`,
  );
}

function resolveRepoPath(relativePath) {
  return path.join(repoRoot, relativePath);
}

function updateJson(relativePath, updater) {
  const filePath = resolveRepoPath(relativePath);
  const json = JSON.parse(readFileSync(filePath, 'utf8'));
  updater(json);
  writeFileSync(filePath, `${JSON.stringify(json, null, 2)}\n`);
}

function replacePackageVersion(relativePath, packageName) {
  const filePath = resolveRepoPath(relativePath);
  let content = readFileSync(filePath, 'utf8');
  const packageBlock = new RegExp(
    `(\\[package\\][\\s\\S]*?^name\\s*=\\s*"${packageName}"[\\s\\S]*?^version\\s*=\\s*)"[^"]+"`,
    'm',
  );
  if (!packageBlock.test(content)) {
    throw new Error(`Could not find ${packageName} package version in ${relativePath}.`);
  }
  content = content.replace(packageBlock, `$1"${version}"`);
  writeFileSync(filePath, content);
}

function replaceCargoLockPackageVersion(relativePath, packageName) {
  const filePath = resolveRepoPath(relativePath);
  if (!existsSync(filePath)) return;
  let content = readFileSync(filePath, 'utf8');
  const packageBlock = new RegExp(
    `(\\[\\[package\\]\\][\\s\\S]*?^name\\s*=\\s*"${packageName}"[\\s\\S]*?^version\\s*=\\s*)"[^"]+"`,
    'm',
  );
  if (!packageBlock.test(content)) {
    throw new Error(`Could not find ${packageName} lockfile version in ${relativePath}.`);
  }
  content = content.replace(packageBlock, `$1"${version}"`);
  writeFileSync(filePath, content);
}

updateJson('apps/desktop/package.json', (json) => {
  json.version = version;
});

updateJson('apps/desktop/src-tauri/tauri.conf.json', (json) => {
  json.version = version;
});

updateJson('package-lock.json', (json) => {
  if (json.packages?.['apps/desktop']) {
    json.packages['apps/desktop'].version = version;
  }
});

replacePackageVersion('apps/desktop/src-tauri/Cargo.toml', 'placet-desktop');
replaceCargoLockPackageVersion('apps/desktop/src-tauri/Cargo.lock', 'placet-desktop');

console.log(`Desktop release version synchronized to ${version}.`);
