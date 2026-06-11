/**
 * electron-builder afterPack hook.
 *
 * extraResources silently skips node_modules inside the copied tree, so the
 * standalone server would ship without its runtime deps (incl. the
 * better-sqlite3 native binding). Copy them explicitly into resources/server.
 */
const fs = require('fs');
const path = require('path');

module.exports = async function afterPack(context) {
  const src = path.join(context.packager.projectDir, '.next', 'standalone', 'node_modules');
  const dest = path.join(context.appOutDir, 'resources', 'server', 'node_modules');
  if (!fs.existsSync(src)) {
    throw new Error('afterPack: .next/standalone/node_modules missing — run `npm run prepare:standalone` first');
  }
  fs.rmSync(dest, { recursive: true, force: true });
  fs.cpSync(src, dest, { recursive: true });

  const binding = path.join(dest, 'better-sqlite3', 'build', 'Release', 'better_sqlite3.node');
  if (!fs.existsSync(binding)) {
    throw new Error('afterPack: better_sqlite3.node missing from packaged server — run `npm rebuild better-sqlite3`');
  }
  console.log('afterPack: copied standalone node_modules into resources/server');
};
