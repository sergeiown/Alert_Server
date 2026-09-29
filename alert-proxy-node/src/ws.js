// Copyright (c) 2024-2026 Serhii I. Myshko
// Licensed under the MIT License. See LICENSE for details.

const { WebSocketServer } = require('ws');
const gateway = require('./gateway');
const neptun = require('./neptun');
const users = require('./users');
const { checkClientKey } = require('./auth');

function attachWebSockets(server) {
    const alertsWss = new WebSocketServer({ noServer: true });
    const activeWss = new WebSocketServer({ noServer: true });
    const neptunWss = new WebSocketServer({ noServer: true });

    alertsWss.on('connection', (ws) => {
        gateway.acceptAlertsSocket(ws);
        ws.on('close', () => gateway.unregisterSocket('alerts', ws));
        ws.on('error', () => {});
        ws.on('message', () => {});
    });

    activeWss.on('connection', (ws) => {
        gateway.acceptActiveSocket(ws);
        ws.on('close', () => gateway.unregisterSocket('active', ws));
        ws.on('error', () => {});
        ws.on('message', () => {});
    });

    neptunWss.on('connection', (ws) => {
        neptun.acceptSocket(ws);
        ws.on('close', () => neptun.unregisterSocket(ws));
        ws.on('error', () => {});
        ws.on('message', () => {});
    });

    server.on('upgrade', (request, socket, head) => {
        const url = new URL(request.url, 'http://localhost');

        if (!checkClientKey(url, request.headers)) {
            socket.write('HTTP/1.1 401 Unauthorized\r\n\r\n');
            socket.destroy();
            return;
        }

        const forwarded = request.headers['x-forwarded-for'];
        const ip = forwarded ? forwarded.split(',')[0].trim() : request.socket.remoteAddress;
        users
            .recordRequest(ip, `ws:${url.pathname}`, url.searchParams.get('v'))
            .then(() => users.notePeak(gateway.totalConnections() + 1))
            .catch(() => {});

        if (url.pathname === '/ws-neptun') {
            neptunWss.handleUpgrade(request, socket, head, (ws) => neptunWss.emit('connection', ws, request));
            return;
        }

        if (url.pathname === '/ws') {
            alertsWss.handleUpgrade(request, socket, head, (ws) => alertsWss.emit('connection', ws, request));
            return;
        }

        if (url.pathname === '/ws-alerts-in-ua') {
            activeWss.handleUpgrade(request, socket, head, (ws) => activeWss.emit('connection', ws, request));
            return;
        }

        socket.write('HTTP/1.1 404 Not Found\r\n\r\n');
        socket.destroy();
    });
}

module.exports = { attachWebSockets };
