// Copyright (c) 2024-2026 Serhii I. Myshko
// Licensed under the MIT License. See LICENSE for details.

const SUMMARY_EVERY_MS = 5 * 60 * 1000;

function formatSpan(ms) {
    const seconds = Math.max(0, Math.round(ms / 1000));
    if (seconds < 120) return `${seconds} s`;
    return `${Math.floor(seconds / 60)} min ${seconds % 60} s`;
}

function attemptsText(count) {
    return `${count} ${count === 1 ? 'attempt' : 'attempts'}`;
}

function createOutageLog({ label, log, now = Date.now }) {
    let startedAt = null;
    let attempts = 0;
    let lastNoteAt = 0;

    function fail(message) {
        const at = now();
        if (startedAt === null) {
            startedAt = at;
            attempts = 1;
            lastNoteAt = at;
            log(message);
            return;
        }
        attempts += 1;
        if (at - lastNoteAt >= SUMMARY_EVERY_MS) {
            lastNoteAt = at;
            log(`${label}: still unreachable after ${attemptsText(attempts)} in ${formatSpan(at - startedAt)}`);
        }
    }

    function recover(message) {
        if (startedAt === null) {
            log(message);
            return;
        }
        const span = formatSpan(now() - startedAt);
        const count = attempts;
        startedAt = null;
        attempts = 0;
        log(`${message} after ${attemptsText(count)} in ${span}`);
    }

    return { fail, recover, isActive: () => startedAt !== null };
}

module.exports = { createOutageLog, formatSpan };
