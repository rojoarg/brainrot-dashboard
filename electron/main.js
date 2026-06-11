const { app, BrowserWindow, shell, dialog } = require('electron');
const { spawn } = require('child_process');
const path = require('path');
const http = require('http');

/**
 * Brainrot Market Intelligence — desktop shell.
 *
 * Packaged mode: spawns the Next.js standalone server on a bundled Node
 * runtime (resources/server/node.exe). Bundling Node avoids the classic
 * Electron-vs-Node ABI mismatch for better-sqlite3 — the server runs on the
 * exact runtime it was built for.
 *
 * Dev mode (`npm run electron` while `npm run dev` is running): just opens
 * a window pointing at localhost:3000.
 */

const DEV_URL = 'http://localhost:3000';
const SCRAPE_STALE_HOURS = 12;       // auto-scrape on launch if data older than this
const RESCRAPE_INTERVAL_MS = 6 * 60 * 60 * 1000; // and every 6h while open

let serverProc = null;
let mainWindow = null;
let baseUrl = DEV_URL;

const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
  app.quit();
} else {
  app.on('second-instance', () => {
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.focus();
    }
  });
}

function findFreePort() {
  return new Promise((resolve, reject) => {
    const srv = require('net').createServer();
    srv.unref();
    srv.on('error', reject);
    srv.listen(0, '127.0.0.1', () => {
      const port = srv.address().port;
      srv.close(() => resolve(port));
    });
  });
}

function waitForServer(url, timeoutMs) {
  const deadline = Date.now() + timeoutMs;
  return new Promise((resolve, reject) => {
    const tryOnce = () => {
      const req = http.get(url, res => {
        res.resume();
        if (res.statusCode && res.statusCode < 500) return resolve();
        next();
      });
      req.on('error', next);
      req.setTimeout(2000, () => { req.destroy(); next(); });
    };
    const next = () => {
      if (Date.now() > deadline) return reject(new Error('Server did not start in time'));
      setTimeout(tryOnce, 400);
    };
    tryOnce();
  });
}

async function startServer() {
  const port = await findFreePort();
  const serverDir = path.join(process.resourcesPath, 'server');
  const nodeBin = path.join(serverDir, 'node.exe');
  const dbPath = path.join(app.getPath('userData'), 'brainrot.db');

  serverProc = spawn(nodeBin, ['server.js'], {
    cwd: serverDir,
    env: {
      ...process.env,
      NODE_ENV: 'production',
      PORT: String(port),
      HOSTNAME: '127.0.0.1',
      BRAINROT_DB_PATH: dbPath,
    },
    stdio: ['ignore', 'pipe', 'pipe'],
    windowsHide: true,
  });
  serverProc.stdout.on('data', d => console.log('[server]', String(d).trim()));
  serverProc.stderr.on('data', d => console.error('[server]', String(d).trim()));
  serverProc.on('exit', (code) => {
    console.error(`[server] exited with code ${code}`);
    serverProc = null;
  });

  baseUrl = `http://127.0.0.1:${port}`;
  await waitForServer(baseUrl, 30000);
}

async function maybeAutoScrape() {
  try {
    const res = await fetch(`${baseUrl}/api/scrape?action=status`);
    const { run } = await res.json();
    if (run?.status === 'running') return;
    const last = run?.completed_at ? new Date(run.completed_at).getTime() : 0;
    const ageHours = (Date.now() - last) / 3600000;
    if (run?.status !== 'completed' || ageHours >= SCRAPE_STALE_HOURS) {
      console.log(`[auto-scrape] data is ${run ? Math.round(ageHours) + 'h old' : 'missing'} — starting scrape`);
      await fetch(`${baseUrl}/api/scrape`);
    }
  } catch (err) {
    console.error('[auto-scrape] failed:', err.message);
  }
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1560,
    height: 940,
    minWidth: 980,
    minHeight: 640,
    backgroundColor: '#0a0a0c',
    autoHideMenuBar: true,
    title: 'Brainrot Market Intelligence',
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  // Only ever hand http(s) URLs to the OS — never file:, javascript:, ms-*,
  // etc. (a dropped file or a malicious scraped link could otherwise launch
  // an arbitrary handler).
  const openExternalSafely = (url) => {
    try {
      const u = new URL(url);
      if (u.protocol === 'https:' || u.protocol === 'http:') shell.openExternal(url);
    } catch { /* not a valid URL — ignore */ }
  };

  // External links open in the system browser, not in the app window
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    openExternalSafely(url);
    return { action: 'deny' };
  });
  mainWindow.webContents.on('will-navigate', (e, url) => {
    if (!url.startsWith(baseUrl) && !url.startsWith(DEV_URL)) {
      e.preventDefault();
      openExternalSafely(url);
    }
  });

  mainWindow.loadURL(baseUrl);
  mainWindow.on('closed', () => { mainWindow = null; });
}

function stopServer() {
  if (serverProc) {
    try { serverProc.kill(); } catch { /* already dead */ }
    serverProc = null;
  }
}

app.whenReady().then(async () => {
  try {
    if (app.isPackaged) {
      await startServer();
    } else {
      baseUrl = DEV_URL;
      let devUp = true;
      await waitForServer(`${DEV_URL}/api/data`, 8000).catch(() => { devUp = false; });
      if (!devUp) {
        dialog.showErrorBox('Dev server not running', 'Run `npm run dev` first, then `npm run electron`.');
        app.quit();
        return; // single dialog, no re-throw into the outer catch
      }
    }
    createWindow();
    maybeAutoScrape();
    setInterval(maybeAutoScrape, RESCRAPE_INTERVAL_MS);
  } catch (err) {
    dialog.showErrorBox('Brainrot Market Intelligence', `Failed to start the local server:\n\n${err.message}`);
    app.quit();
  }
});

app.on('window-all-closed', () => {
  stopServer();
  app.quit();
});
app.on('before-quit', stopServer);
process.on('exit', stopServer);
