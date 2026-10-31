#!/usr/bin/env node
'use strict';
// Serve the game for a browser with the two headers that unlock shared memory
// (Cross-Origin-Opener-Policy and Cross-Origin-Embedder-Policy), so it can render on every
// CPU core. No dependencies:  node serve.js [port]
const http = require('http');
const fs = require('fs');
const path = require('path');

const root = __dirname;
const port = parseInt(process.argv[2] || process.env.PORT || '8000', 10);
const types = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json',
  '.md': 'text/markdown; charset=utf-8',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
};

http
  .createServer((req, res) => {
    let rel;
    try {
      rel = decodeURIComponent(new URL(req.url, 'http://x').pathname);
    } catch (e) {
      res.writeHead(400).end();
      return;
    }
    if (rel.endsWith('/')) rel += 'index.html';
    const file = path.join(root, path.normalize(rel));
    if (!file.startsWith(root + path.sep) || /[\\/](node_modules|\.git)([\\/]|$)/.test(file)) {
      res.writeHead(403).end();
      return;
    }
    fs.readFile(file, (err, data) => {
      if (err) {
        res.writeHead(404, { 'Content-Type': 'text/plain' }).end('not found');
        return;
      }
      res.writeHead(200, {
        'Content-Type': types[path.extname(file)] || 'application/octet-stream',
        'Cross-Origin-Opener-Policy': 'same-origin',
        'Cross-Origin-Embedder-Policy': 'require-corp',
        'Cache-Control': 'no-cache',
      });
      res.end(data);
    });
  })
  .listen(port, '127.0.0.1', () => {
    console.log(`ASCIIOOTER: http://localhost:${port}  (shared memory on, all CPU cores)`);
  });
