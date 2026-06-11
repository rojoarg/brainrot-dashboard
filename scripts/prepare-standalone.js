/**
 * Assembles the self-contained server folder that the Electron app spawns.
 * Run after `next build` (standalone output):
 *   .next/standalone/           ← server.js + minimal node_modules (incl. better-sqlite3)
 *   + .next/standalone/.next/static  ← client assets (next build leaves them outside)
 *   + .next/standalone/public        ← public assets
 *   + .next/standalone/node.exe      ← the exact Node runtime the build targets
 *
 * Bundling node.exe sidesteps Electron/Node ABI mismatches for better-sqlite3:
 * the server always runs on the same runtime that `npm install` compiled for.
 */
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const standalone = path.join(root, '.next', 'standalone');

if (!fs.existsSync(path.join(standalone, 'server.js'))) {
  console.error('No .next/standalone/server.js — run `next build` first (output: "standalone").');
  process.exit(1);
}

const copies = [
  { from: path.join(root, '.next', 'static'), to: path.join(standalone, '.next', 'static') },
  { from: path.join(root, 'public'), to: path.join(standalone, 'public') },
];
for (const { from, to } of copies) {
  if (!fs.existsSync(from)) continue;
  fs.rmSync(to, { recursive: true, force: true });
  fs.cpSync(from, to, { recursive: true });
  console.log(`copied ${path.relative(root, from)} -> ${path.relative(root, to)}`);
}

// Bundle the running Node runtime
const nodeDest = path.join(standalone, 'node.exe');
fs.copyFileSync(process.execPath, nodeDest);
console.log(`bundled node.exe (${process.version}) -> ${path.relative(root, nodeDest)}`);

console.log('standalone server ready.');
