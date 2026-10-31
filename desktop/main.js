'use strict';
// ASCIIOOTER desktop: an Electron shell around the same files the browser version uses.
// What it adds over a browser tab:
//   - the game is served from a private app:// origin with cross-origin isolation headers, so
//     shared memory is available and the renderer splits every frame across all CPU cores
//   - the GPU blocklist is ignored and the discrete GPU is preferred
//   - no background throttling, no autoplay gate on audio, no browser chrome
//   - F11 / Alt+Enter toggle fullscreen
const { app, BrowserWindow, protocol, shell } = require('electron');
const path = require('path');
const fs = require('fs');

const ROOT = path.join(__dirname, '..');
const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
};

protocol.registerSchemesAsPrivileged([
  { scheme: 'app', privileges: { standard: true, secure: true, supportFetchAPI: true, stream: true } },
]);

app.commandLine.appendSwitch('ignore-gpu-blocklist');
app.commandLine.appendSwitch('enable-gpu-rasterization');
app.commandLine.appendSwitch('enable-zero-copy');
app.commandLine.appendSwitch('force_high_performance_gpu');
app.commandLine.appendSwitch('disable-renderer-backgrounding');
app.commandLine.appendSwitch('disable-background-timer-throttling');
app.commandLine.appendSwitch('autoplay-policy', 'no-user-gesture-required');
if (process.argv.includes('--uncapped')) {
  // frame rate beyond the display's refresh, for benchmarking
  app.commandLine.appendSwitch('disable-frame-rate-limit');
  app.commandLine.appendSwitch('disable-gpu-vsync');
}

if (!app.requestSingleInstanceLock()) app.quit();

function serve(req) {
  let rel;
  try {
    rel = decodeURIComponent(new URL(req.url).pathname);
  } catch (e) {
    return new Response('bad request', { status: 400 });
  }
  if (rel === '/' || rel === '') rel = '/index.html';
  const file = path.normalize(path.join(ROOT, rel));
  if (!file.startsWith(ROOT + path.sep)) return new Response('forbidden', { status: 403 });
  return fs.promises.readFile(file).then(
    (data) =>
      new Response(data, {
        headers: {
          'Content-Type': TYPES[path.extname(file)] || 'application/octet-stream',
          'Cross-Origin-Opener-Policy': 'same-origin',
          'Cross-Origin-Embedder-Policy': 'require-corp',
          'Cross-Origin-Resource-Policy': 'same-origin',
        },
      }),
    () => new Response('not found', { status: 404 }),
  );
}

let win = null;
function createWindow() {
  win = new BrowserWindow({
    width: 1600,
    height: 900,
    minWidth: 800,
    minHeight: 500,
    backgroundColor: '#000000',
    title: 'ASCIIOOTER',
    autoHideMenuBar: true,
    fullscreen: process.argv.includes('--fullscreen'),
    show: false,
    webPreferences: {
      backgroundThrottling: false,
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      spellcheck: false,
    },
  });
  win.removeMenu();
  win.once('ready-to-show', () => win.show());
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:/.test(url)) shell.openExternal(url);
    return { action: 'deny' };
  });
  win.webContents.on('will-navigate', (e, url) => {
    if (!url.startsWith('app://')) e.preventDefault();
  });
  win.webContents.on('before-input-event', (e, input) => {
    if (input.type !== 'keyDown') return;
    if (input.key === 'F11' || (input.alt && input.key === 'Enter')) {
      win.setFullScreen(!win.isFullScreen());
      e.preventDefault();
    } else if (input.key === 'F12' && process.argv.includes('--devtools')) {
      win.webContents.toggleDevTools();
    }
  });
  const q = process.argv.includes('--game-debug') ? '?debug' : '';
  win.loadURL('app://game/index.html' + q);
  win.on('closed', () => (win = null));
}

app.on('second-instance', () => {
  if (!win) return;
  if (win.isMinimized()) win.restore();
  win.focus();
});
app.whenReady().then(() => {
  protocol.handle('app', serve);
  createWindow();
  app.on('activate', () => {
    if (!BrowserWindow.getAllWindows().length) createWindow();
  });
});
app.on('window-all-closed', () => app.quit());
