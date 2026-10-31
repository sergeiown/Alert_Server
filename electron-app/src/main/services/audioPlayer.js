// Copyright (c) 2024-2026 Serhii I. Myshko
// Licensed under the MIT License. See LICENSE for details.

const { getResourcePath } = require('./appPaths');
const { logEvent } = require('./logger');
const { play } = require('./soundEngine');

const START_GAP_MS = 8000;
const END_GAP_MS = 6000;
const MAX_REPEATS = 2;

let current = null;

function voicePath(language, cancelled) {
    const base = cancelled ? 'alert_cancellation' : 'alert';
    const suffix = language === 'English' ? 'eng' : 'ukr';
    return getResourcePath('audio', `${base}_${suffix}.wav`);
}

function sirenPath(cancelled) {
    return getResourcePath('audio', cancelled ? 'siren_cancel.wav' : 'siren_alert.wav');
}

function normalizeVolume(volume) {
    const percent = Number(volume);
    if (!Number.isFinite(percent)) return 1;
    return Math.max(0.1, Math.min(1, percent / 100));
}

function soundFor(kind, mode, language, count, volume) {
    if (!mode || mode === 'none') return null;
    const repeats = Math.max(1, Math.min(MAX_REPEATS, Number(count) || 1));
    const level = normalizeVolume(volume);
    if (kind === 'start') return { kind, file: mode === 'voice' ? voicePath(language, false) : sirenPath(false), count: repeats, gapMs: START_GAP_MS, volume: level };
    if (kind === 'end') return { kind, file: mode === 'voice' ? voicePath(language, true) : sirenPath(true), count: repeats, gapMs: END_GAP_MS, volume: level };
    if (kind === 'up') return { kind, file: getResourcePath('audio', 'level_up.wav'), count: 1, gapMs: 0, volume: level };
    if (kind === 'down') return { kind, file: getResourcePath('audio', 'level_down.wav'), count: 1, gapMs: 0, volume: level };
    return null;
}

function stopCurrent() {
    if (!current) return;
    const run = current;
    current = null;
    run.stopped = true;
    clearTimeout(run.timer);
    if (run.child) {
        try {
            run.child.kill();
        } catch (err) {
            logEvent(`Sound stop error: ${err.message}`, 'ERROR');
        }
    }
}

function playFor(owner, spec) {
    stopCurrent();
    if (!spec) return;

    const run = { owner, stopped: false, child: null, timer: null, left: spec.count };
    current = run;

    const next = () => {
        if (run.stopped || run.left <= 0) {
            if (current === run) current = null;
            return;
        }
        run.left -= 1;
        const startedAt = Date.now();
        run.child = play(spec.file, spec.volume, (err) => {
            if (run.stopped) return;
            if (err) logEvent(`Sound playback error: ${err.message}`, 'ERROR');
            if (run.left <= 0) {
                if (current === run) current = null;
                return;
            }
            run.timer = setTimeout(next, Math.max(0, spec.gapMs - (Date.now() - startedAt)));
        });
    };

    next();
}

function stopFor(owner) {
    if (current && current.owner === owner) stopCurrent();
}

module.exports = { soundFor, playFor, stopFor };
