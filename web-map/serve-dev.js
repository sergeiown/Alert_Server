// Copyright (c) 2024-2026 Serhii I. Myshko
// Licensed under the MIT License. See LICENSE for details.

const http = require('node:http');
const net = require('node:net');
const fs = require('node:fs');
const path = require('node:path');

const DIST = path.join(__dirname, 'dist');
const PORT = Number(process.env.DEV_PORT) || 8810;
const TARGET_PORT = Number(process.env.API_PORT) || 8801;

const TYPES = {
    '.html': 'text/html; charset=utf-8',
    '.js': 'text/javascript; charset=utf-8',
    '.css': 'text/css; charset=utf-8',
    '.json': 'application/json; charset=utf-8',
    '.svg': 'image/svg+xml',
    '.png': 'image/png',
    '.webmanifest': 'application/manifest+json',
};

const server = http.createServer((req, res) => {
    const url = new URL(req.url, 'http://localhost');

    if (url.pathname.startsWith('/public/')) {
        const upstream = http.request(
            { host: '127.0.0.1', port: TARGET_PORT, path: req.url, method: req.method, headers: req.headers },
            (response) => {
                res.writeHead(response.statusCode, response.headers);
                response.pipe(res);
            }
        );
        upstream.on('error', () => {
            res.writeHead(502);
            res.end('bad gateway');
        });
        req.pipe(upstream);
        return;
    }

    const relative = url.pathname === '/' ? 'index.html' : decodeURIComponent(url.pathname.slice(1));
    const file = path.join(DIST, path.normalize(relative));
    if (!file.startsWith(DIST) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) {
        res.writeHead(404);
        res.end('not found');
        return;
    }
    res.writeHead(200, {
        'Content-Type': TYPES[path.extname(file)] || 'application/octet-stream',
        'Content-Security-Policy': "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'self'; font-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'self'; object-src 'none'",
    });
    fs.createReadStream(file).pipe(res);
});

server.on('upgrade', (req, socket, head) => {
    const upstream = net.connect(TARGET_PORT, '127.0.0.1', () => {
        upstream.write(`${req.method} ${req.url} HTTP/1.1\r\n` + Object.entries(req.headers).map(([k, v]) => `${k}: ${v}`).join('\r\n') + '\r\n\r\n');
        upstream.write(head);
        socket.pipe(upstream).pipe(socket);
    });
    upstream.on('error', () => socket.destroy());
    socket.on('error', () => upstream.destroy());
});

server.listen(PORT, '127.0.0.1', () => console.log(`dev web-map on http://127.0.0.1:${PORT} (API ${TARGET_PORT})`));
