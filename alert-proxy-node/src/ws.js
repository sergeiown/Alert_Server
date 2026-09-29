// Copyright (c) 2024-2026 Serhii I. Myshko
// Licensed under the MIT License. See LICENSE for details.

const { WebSocketServer } = require('ws');
const gateway = require('./gateway');
const { checkClientKey } = require('./auth');

function attachWebSockets(server) {
    const alertsWss = new WebSocketServer({ noServer: true });
    const activeWss = new WebSocketServer({ noServer: true });

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

    server.on('upgrade', (request, socket, head) => {
        const url = new URL(request.url, 'http://localhost');

        if (!checkClientKey(url, request.headers)) {
            socket.write('HTTP/1.1 401 Unauthorized\r\n\r\n');
            socket.destroy();
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
