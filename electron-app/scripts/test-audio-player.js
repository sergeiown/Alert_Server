// Copyright (c) 2024-2026 Serhii I. Myshko
// Licensed under the MIT License. See LICENSE for details.

const assert = require('assert');
const Module = require('module');
const path = require('path');

const root = path.join(__dirname, '..');
const children = [];
const duckCalls = { begin: 0, end: 0 };

class FakeChild {
    constructor(file, volume, done) {
        this.file = file;
        this.volume = volume;
        this.done = done;
        this.killed = false;
        children.push(this);
    }
    kill() {
        this.killed = true;
        setImmediate(() => this.done(null));
    }
    finish() {
        this.done(null);
    }
}

const mocks = {
    './soundEngine': { play: (file, volume, done) => new FakeChild(file, volume, done) },
    './appPaths': { getResourcePath: (...parts) => path.join(root, 'resources', ...parts) },
    './logger': { logEvent() {} },
    './audioDucking': { begin: () => (duckCalls.begin += 1), end: () => (duckCalls.end += 1) },
};
const originalLoad = Module._load;
Module._load = function patched(request, parent, isMain) {
    if (Object.prototype.hasOwnProperty.call(mocks, request)) return mocks[request];
    return originalLoad.call(this, request, parent, isMain);
};

const { soundFor, playFor, stopFor } = require(path.join(root, 'src/main/services/audioPlayer.js'));
const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
let passed = 0;
const check = async (name, fn) => {
    children.length = 0;
    await fn();
    passed++;
    console.log(`ok - ${name}`);
};

(async () => {
    await check('sound modes: none gives no sound, voice follows the language, siren is language free', () => {
        assert.strictEqual(soundFor('start', 'none', 'Ukrainian', 2), null);
        assert.ok(soundFor('start', 'voice', 'English', 2).file.endsWith('alert_eng.wav'));
        assert.ok(soundFor('start', 'voice', 'Ukrainian', 2).file.endsWith('alert_ukr.wav'));
        assert.ok(soundFor('end', 'siren', 'English', 1).file.endsWith('siren_cancel.wav'));
        assert.strictEqual(soundFor('up', 'siren', 'English', 3).count, 1);
        assert.strictEqual(soundFor('unknown', 'siren', 'English', 1), null);
        assert.strictEqual(soundFor('start', 'siren', 'English', 10).count, 2);
        assert.strictEqual(soundFor('start', 'siren', 'English', 0).count, 1);
    });

    await check('volume is passed as a fraction, clamped to 10 percent and 100 percent, and defaults to full', () => {
        assert.strictEqual(soundFor('start', 'siren', 'English', 1, 50).volume, 0.5);
        assert.strictEqual(soundFor('start', 'siren', 'English', 1, 0).volume, 0.1);
        assert.strictEqual(soundFor('start', 'siren', 'English', 1, 500).volume, 1);
        assert.strictEqual(soundFor('end', 'voice', 'English', 1).volume, 1);
        assert.strictEqual(soundFor('up', 'siren', 'English', 1, 30).volume, 0.3);
    });

    await check('the engine receives the volume of the spec', async () => {
        playFor('toast-v', { kind: 'start', file: 'v.wav', count: 1, gapMs: 0, volume: 0.4 });
        assert.strictEqual(children[0].volume, 0.4);
        stopFor('toast-v');
        await wait(10);
    });

    await check('other sounds are lowered while a sound plays and released when it stops or finishes', async () => {
        duckCalls.begin = 0;
        duckCalls.end = 0;
        assert.strictEqual(soundFor('start', 'siren', 'English', 1, 100).duck, true);
        assert.strictEqual(soundFor('start', 'siren', 'English', 1, 100, false).duck, false);
        playFor('toast-duck', { kind: 'start', file: 'd.wav', count: 1, gapMs: 0, volume: 1, duck: true });
        assert.strictEqual(duckCalls.begin, 1);
        stopFor('toast-duck');
        assert.strictEqual(duckCalls.end, 1);
        await wait(10);
        playFor('toast-duck2', { kind: 'start', file: 'd2.wav', count: 1, gapMs: 0, volume: 1, duck: true });
        children[children.length - 1].finish();
        await wait(10);
        assert.strictEqual(duckCalls.begin, 2);
        assert.strictEqual(duckCalls.end, 2);
        playFor('toast-nod', { kind: 'start', file: 'n.wav', count: 1, gapMs: 0, volume: 1, duck: false });
        assert.strictEqual(duckCalls.begin, 2);
        stopFor('toast-nod');
        assert.strictEqual(duckCalls.end, 2);
        await wait(10);
    });

    await check('a new sound interrupts the previous one, so only the latest toast has a voice', async () => {
        playFor('toast-a', { kind: 'start', file: 'a.wav', count: 1, gapMs: 0 });
        playFor('toast-b', { kind: 'start', file: 'b.wav', count: 1, gapMs: 0 });
        assert.strictEqual(children.length, 2);
        assert.strictEqual(children[0].killed, true);
        assert.strictEqual(children[1].killed, false);
        stopFor('toast-b');
        await wait(10);
    });

    await check('closing an older toast does not silence the newer one', async () => {
        playFor('toast-a', { kind: 'start', file: 'a.wav', count: 1, gapMs: 0 });
        playFor('toast-b', { kind: 'start', file: 'b.wav', count: 1, gapMs: 0 });
        stopFor('toast-a');
        assert.strictEqual(children[1].killed, false);
        stopFor('toast-b');
        assert.strictEqual(children[1].killed, true);
        await wait(10);
    });

    await check('repeats continue only while the owner stays', async () => {
        playFor('toast-c', { kind: 'start', file: 'c.wav', count: 3, gapMs: 20 });
        children[0].finish();
        await wait(40);
        assert.strictEqual(children.length, 2);
        stopFor('toast-c');
        children[1].finish();
        await wait(40);
        assert.strictEqual(children.length, 2);
    });

    await check('all repeats play and then the sequence ends on its own', async () => {
        playFor('toast-d', { kind: 'start', file: 'd.wav', count: 2, gapMs: 10 });
        children[0].finish();
        await wait(30);
        assert.strictEqual(children.length, 2);
        children[1].finish();
        await wait(30);
        assert.strictEqual(children.length, 2);
    });

    Module._load = originalLoad;
    console.log(`\n${passed} checks passed`);
    process.exit(0);
})().catch((err) => {
    console.error(err);
    process.exit(1);
});
