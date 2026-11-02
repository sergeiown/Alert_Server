// Copyright (c) 2024-2026 Serhii I. Myshko
// Licensed under the MIT License. See LICENSE for details.

const { getResourcePath } = require('./appPaths');
const { logEvent } = require('./logger');
const { play } = require('./soundEngine');
const ducking = require('./audioDucking');

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

function soundFor(kind, mode, language, count, volume, duck) {
    if (!mode || mode === 'none') return null;
    const repeats = Math.max(1, Math.min(MAX_REPEATS, Number(count) || 1));
    const level = normalizeVolume(volume);
    const lowerOthers = duck !== false;
    if (kind === 'start') return { kind, file: mode === 'voice' ? voicePath(language, false) : sirenPath(false), count: repeats, gapMs: START_GAP_MS, volume: level, duck: lowerOthers };
    if (kind === 'end') return { kind, file: mode === 'voice' ? voicePath(language, true) : sirenPath(true), count: repeats, gapMs: END_GAP_MS, volume: level, duck: lowerOthers };
    if (kind === 'up') return { kind, file: getResourcePath('audio', 'level_up.wav'), count: 1, gapMs: 0, volume: level, duck: lowerOthers };
    if (kind === 'down') return { kind, file: getResourcePath('audio', 'level_down.wav'), count: 1, gapMs: 0, volume: level, duck: lowerOthers };
    return null;
}

function releaseDucking(run) {
    if (!run.ducking) return;
    run.ducking = false;
    ducking.end();
}

function endRun(run) {
    if (!run.onEnd) return;
    const callback = run.onEnd;
    run.onEnd = null;
    callback();
}

function stopCurrent() {
    if (!current) return;
    const run = current;
    current = null;
    run.stopped = true;
    releaseDucking(run);
    endRun(run);
    clearTimeout(run.timer);
    if (run.child) {
        try {
            run.child.kill();
        } catch (err) {
            logEvent(`Sound stop error: ${err.message}`, 'ERROR');
        }
    }
}

function playFor(owner, spec, onEnd) {
    stopCurrent();
    if (!spec) {
        if (onEnd) onEnd();
        return;
    }

    const run = { owner, stopped: false, child: null, timer: null, left: spec.count, ducking: false, onEnd: onEnd || null };
    current = run;
    if (spec.duck) {
        run.ducking = true;
        ducking.begin();
    }

    const next = () => {
        if (run.stopped || run.left <= 0) {
            if (current === run) current = null;
            releaseDucking(run);
            endRun(run);
            return;
        }
        run.left -= 1;
        const startedAt = Date.now();
        run.child = play(spec.file, spec.volume, (err) => {
            if (run.stopped) return;
            if (err) logEvent(`Sound playback error: ${err.message}`, 'ERROR');
            if (run.left <= 0) {
                if (current === run) current = null;
                releaseDucking(run);
                endRun(run);
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

function isPlayingFor(owner) {
    return Boolean(current && current.owner === owner);
}

module.exports = { soundFor, playFor, stopFor, isPlayingFor };
