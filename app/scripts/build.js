'use strict';

/**
 * "Build" step for a plain Node service: there is no bundler, so the build
 * produces a versioned, dependency-complete artifact directory that Jenkins
 * archives and the deploy script unpacks.
 *
 * Output: dist/  (server.js, src/, public/, package*.json, BUILD_INFO.json)
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const root = path.join(__dirname, '..');
const dist = path.join(root, 'dist');

function sh(cmd, fallback) {
  try {
    return execSync(cmd, { cwd: root, stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim();
  } catch {
    return fallback;
  }
}

// Start from a clean slate so stale files never ship.
fs.rmSync(dist, { recursive: true, force: true });
fs.mkdirSync(dist, { recursive: true });

const include = ['server.js', 'src', 'public', 'package.json', 'package-lock.json'];

for (const entry of include) {
  const from = path.join(root, entry);
  if (!fs.existsSync(from)) {
    console.warn(`build: skipping missing ${entry}`);
    continue;
  }
  fs.cpSync(from, path.join(dist, entry), { recursive: true });
}

const buildInfo = {
  version: require(path.join(root, 'package.json')).version,
  commit: process.env.GIT_COMMIT || sh('git rev-parse HEAD', 'unknown'),
  branch: process.env.GIT_BRANCH || sh('git rev-parse --abbrev-ref HEAD', 'unknown'),
  build_number: process.env.BUILD_NUMBER || 'local',
  built_at: new Date().toISOString(),
  node_version: process.version,
};

fs.writeFileSync(path.join(dist, 'BUILD_INFO.json'), `${JSON.stringify(buildInfo, null, 2)}\n`);

console.log('build: artifact ready at dist/');
console.log(JSON.stringify(buildInfo, null, 2));
