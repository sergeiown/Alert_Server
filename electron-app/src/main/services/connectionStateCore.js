// Copyright (c) 2024-2026 Serhii I. Myshko
// Licensed under the MIT License. See LICENSE for details.

function createConnectionState({ now = Date.now, onChange = () => {} } = {}) {
    let online = true;
    let noData = false;
    let linkDown = false;
    let current = { offline: false, reason: null, since: null };

    function recompute() {
        const reason = !online ? 'offline' : linkDown ? 'link' : noData ? 'nodata' : null;
        if (reason === current.reason) return;
        current = reason ? { offline: true, reason, since: now() } : { offline: false, reason: null, since: null };
        onChange(current);
    }

    return {
        setOnline(value) {
            online = Boolean(value);
            recompute();
        },
        setLinkDown(value) {
            linkDown = Boolean(value);
            recompute();
        },
        setNoData(value) {
            noData = Boolean(value);
            recompute();
        },
        get: () => current,
    };
}

module.exports = { createConnectionState };
