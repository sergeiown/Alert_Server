// Copyright (c) 2024-2026 Serhii I. Myshko
// Licensed under the MIT License. See LICENSE for details.

const clients = new Map();

function open(id, version) {
    const entry = clients.get(id) || { version: null, sockets: 0 };
    if (version) entry.version = version;
    entry.sockets += 1;
    clients.set(id, entry);

    let released = false;
    return () => {
        if (released) return;
        released = true;
        const current = clients.get(id);
        if (!current) return;
        current.sockets -= 1;
        if (current.sockets <= 0) clients.delete(id);
    };
}

function byVersion() {
    const result = {};
    clients.forEach((entry) => {
        const version = entry.version || 'unknown';
        result[version] = (result[version] || 0) + 1;
    });
    return result;
}

function count() {
    return clients.size;
}

module.exports = { open, byVersion, count };
