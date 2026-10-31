// Copyright (c) 2024-2026 Serhii I. Myshko
// Licensed under the MIT License. See LICENSE for details.

const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const Module = require('node:module');

const root = path.join(__dirname, '..');
const { diffAlerts } = require(path.join(root, 'src/main/services/alertDiff.js'));

let passed = 0;
function check(name, fn) {
    fn();
    passed += 1;
    console.log(`ok - ${name}`);
}

const item = (id, level, sig = [], startedAt = '2026-10-20T10:00:00Z') => ({ id, level, startedAt, sig, meta: { name: id } });
const T0 = new Date('2026-10-20T10:00:30Z').getTime();
const step = (prev, items, offsetMs, opts = {}) => diffAlerts(prev, items, { now: T0 + offsetMs, ...opts });

check('start event carries stale flag', () => {
    const fresh = step(new Map(), [item('a', 'yellow')], 0);
    assert.strictEqual(fresh.events.length, 1);
    assert.strictEqual(fresh.events[0].type, 'start');
    assert.strictEqual(fresh.events[0].stale, false);
    const stale = step(new Map(), [item('a', 'yellow', [], '2026-10-20T09:00:00Z')], 0);
    assert.strictEqual(stale.events[0].stale, true);
});

check('no change gives no events', () => {
    const first = step(new Map(), [item('a', 'yellow', ['yellow|d|x'])], 0);
    const second = step(first.nextSnapshot, [item('a', 'yellow', ['yellow|d|x'])], 5000);
    assert.deepStrictEqual(second.events, []);
    assert.strictEqual(second.nextCheckInMs, null);
});

check('escalate needs hysteresis and bypasses cooldown', () => {
    const first = step(new Map(), [item('a', 'yellow')], 0);
    const pending = step(first.nextSnapshot, [item('a', 'red')], 2000);
    assert.deepStrictEqual(pending.events, []);
    assert.ok(pending.nextCheckInMs > 0);
    const early = step(pending.nextSnapshot, [item('a', 'red')], 5000);
    assert.deepStrictEqual(early.events, []);
    const confirmed = step(early.nextSnapshot, [item('a', 'red')], 18000);
    assert.strictEqual(confirmed.events.length, 1);
    assert.strictEqual(confirmed.events[0].type, 'escalate');
    assert.strictEqual(confirmed.events[0].from, 'yellow');
    assert.strictEqual(confirmed.events[0].to, 'red');
    assert.strictEqual(confirmed.nextSnapshot.get('a').level, 'red');
    assert.strictEqual(confirmed.nextSnapshot.get('a').maxLevel, 'red');
});

check('flapping level does not notify', () => {
    const first = step(new Map(), [item('a', 'yellow')], 0);
    const toRed = step(first.nextSnapshot, [item('a', 'red')], 2000);
    const backYellow = step(toRed.nextSnapshot, [item('a', 'yellow')], 8000);
    assert.deepStrictEqual(backYellow.events, []);
    assert.strictEqual(backYellow.nextSnapshot.get('a').pending, undefined);
    const toRedAgain = step(backYellow.nextSnapshot, [item('a', 'red')], 9000);
    const stillShort = step(toRedAgain.nextSnapshot, [item('a', 'red')], 12000);
    assert.deepStrictEqual(stillShort.events, []);
});

check('deescalate waits for cooldown then fires', () => {
    let state = step(new Map(), [item('a', 'red')], 0).nextSnapshot;
    let result = step(state, [item('a', 'yellow')], 3000);
    result = step(result.nextSnapshot, [item('a', 'yellow')], 20000);
    assert.deepStrictEqual(result.events, []);
    assert.ok(result.nextCheckInMs > 0);
    result = step(result.nextSnapshot, [item('a', 'yellow')], 62000);
    assert.strictEqual(result.events.length, 1);
    assert.strictEqual(result.events[0].type, 'deescalate');
    assert.strictEqual(result.nextSnapshot.get('a').level, 'yellow');
    assert.strictEqual(result.nextSnapshot.get('a').maxLevel, 'red');
});

check('added threat fires once after cooldown and hysteresis', () => {
    let result = step(new Map(), [item('a', 'red', ['red|A|x'])], 0);
    result = step(result.nextSnapshot, [item('a', 'red', ['red|A|x', 'yellow|B|y'])], 61000);
    assert.deepStrictEqual(result.events, []);
    result = step(result.nextSnapshot, [item('a', 'red', ['red|A|x', 'yellow|B|y'])], 80000);
    assert.strictEqual(result.events.length, 1);
    assert.strictEqual(result.events[0].type, 'addThreat');
    assert.deepStrictEqual(result.events[0].added, ['yellow|B|y']);
    const again = step(result.nextSnapshot, [item('a', 'red', ['red|A|x', 'yellow|B|y'])], 90000);
    assert.deepStrictEqual(again.events, []);
});

check('removed threats are adopted silently', () => {
    let result = step(new Map(), [item('a', 'red', ['red|A|x', 'yellow|B|y'])], 0);
    result = step(result.nextSnapshot, [item('a', 'red', ['red|A|x'])], 70000);
    result = step(result.nextSnapshot, [item('a', 'red', ['red|A|x'])], 90000);
    assert.deepStrictEqual(result.events, []);
    assert.deepStrictEqual(result.nextSnapshot.get('a').sig, ['red|A|x']);
});

check('old record without level is adopted silently', () => {
    const legacy = new Map([['a', { startedAt: '2026-10-20T10:00:00Z', alertType: 'air_raid' }]]);
    const result = step(legacy, [item('a', 'red', ['red|A|x'])], 0);
    assert.deepStrictEqual(result.events, []);
    const entry = result.nextSnapshot.get('a');
    assert.strictEqual(entry.level, 'red');
    assert.strictEqual(entry.maxLevel, 'red');
    assert.deepStrictEqual(entry.sig, ['red|A|x']);
});

check('missing level data is ignored without events', () => {
    let result = step(new Map(), [item('a', 'red', ['red|A|x'])], 0);
    result = step(result.nextSnapshot, [item('a', null, [])], 70000);
    result = step(result.nextSnapshot, [item('a', null, [])], 90000);
    assert.deepStrictEqual(result.events, []);
    assert.strictEqual(result.nextSnapshot.get('a').level, 'red');
    result = step(result.nextSnapshot, [item('a', 'red', ['red|A|x'])], 100000);
    assert.deepStrictEqual(result.events, []);
});

check('level appearing on a levelless entry is adopted silently', () => {
    let result = step(new Map(), [item('a', null)], 0);
    result = step(result.nextSnapshot, [item('a', 'yellow', ['yellow|A|x'])], 5000);
    assert.deepStrictEqual(result.events, []);
    assert.strictEqual(result.nextSnapshot.get('a').level, 'yellow');
});

check('end event when item disappears', () => {
    let result = step(new Map(), [item('a', 'red'), item('b', 'yellow')], 0);
    result = step(result.nextSnapshot, [item('b', 'yellow')], 10000);
    assert.strictEqual(result.events.length, 1);
    assert.strictEqual(result.events[0].type, 'end');
    assert.strictEqual(result.events[0].id, 'a');
    assert.strictEqual(result.events[0].entry.maxLevel, 'red');
    assert.ok(!result.nextSnapshot.has('a'));
});

const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'alert-diff-'));
const captured = { notifications: [], sounds: [], stops: [], shown: [], messages: [], maps: [], nextChoice: null, logs: [] };
const SOUND_NAME = { start: 'alert', end: 'cancel', up: 'up', down: 'down' };
const settings = {
    language: 'Ukrainian',
    visualNotificationsEnabled: true,
    activeAlertNotifyEnabled: true,
    alertSoundMode: 'siren',
    alertSoundCount: 1,
    alertLevelChangeNotifyEnabled: true,
};

class FakeNotification {
    constructor(options) {
        this.options = options;
        this.handlers = {};
        captured.notifications.push(options);
    }
    close() {
        this.closed = true;
    }
    on(event, handler) {
        (this.handlers[event] = this.handlers[event] || []).push(handler);
    }
    emit(event) {
        (this.handlers[event] || []).forEach((handler) => handler());
    }
    show() {
        captured.shown.push(this);
        this.emit('show');
    }
}

const mocks = {
    electron: { Notification: FakeNotification, dialog: { showMessageBox() {} } },
    './appPaths': {
        getUserDataFile: (name) => path.join(tmpDir, name),
        getResourcePath: (...parts) => path.join(root, 'resources', ...parts),
    },
    './logger': { logEvent: (message) => captured.logs.push(message) },
    './settingsStore': { getSettings: () => settings },
    './regionsStore': { getSelectedUids: () => [31] },
    './audioPlayer': {
        soundFor: (kind, mode) => (mode === 'none' ? null : { kind }),
        playFor: (owner, spec) => captured.sounds.push(SOUND_NAME[spec.kind]),
        stopFor: (owner) => captured.stops.push(owner),
    },
    './locationFilter': { getMapRegion: () => ({ stateUid: 1 }) },
    './notificationMap': { renderRegionMapImage: async () => null },
    './forecast': { formatDuration: (ms) => `${Math.round(ms / 60000)} хв` },
    '../windows/messageWindow': {
        showMessage: (options) => {
            captured.messages.push(options);
            const choice = captured.nextChoice || 'close';
            captured.nextChoice = null;
            return Promise.resolve(choice);
        },
    },
    '../windows/liveMapWindow': {
        openLiveMapWindow() {
            captured.maps.push('ukraine');
        },
        openLiveMapWindowInKyivMode() {
            captured.maps.push('kyiv');
        },
    },
};

const originalLoad = Module._load;
Module._load = function patched(request, parent, isMain) {
    if (Object.prototype.hasOwnProperty.call(mocks, request)) return mocks[request];
    return originalLoad.call(this, request, parent, isMain);
};

const notifier = require(path.join(root, 'src/main/services/notifier.js'));

notifier.configureThrottle({ perWindow: 1000, criticalPerWindow: 1000 });
notifier.configureSound({ afterShowMs: 0 });

const realNow = Date.now.bind(Date);
let offset = 0;
Date.now = () => realNow() + offset;

const tick = () => new Promise((resolve) => setImmediate(resolve));
const flush = async () => {
    for (let i = 0; i < 4; i++) await tick();
    await new Promise((resolve) => setTimeout(resolve, 15));
};
const reset = () => {
    captured.notifications.length = 0;
    captured.sounds.length = 0;
    captured.stops.length = 0;
    captured.shown.length = 0;
    captured.messages.length = 0;
    captured.maps.length = 0;
    captured.nextChoice = null;
};
const toastText = (index) => captured.notifications[index].toastXml.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();

const alertAt = (level, threats) => ({
    id: 'm-100-air_raid',
    location_uid: 100,
    location_title: 'Бахмутський район',
    location_lat: 'Bakhmut District',
    alert_type: 'air_raid',
    started_at: new Date(realNow() + offset - 20000).toISOString(),
    alert_level: level,
    threats,
});

const threat = (level, message) => ({ level, started_at: null, source_message: message });
const YELLOW = threat('yellow', 'Дронова загроза (жовтий рівень) Бахмутський район');
const RED = threat('red', 'Ракетна загроза (червоний рівень) Бахмутський район');

async function run() {
    notifier.processAlerts([alertAt('yellow', [YELLOW])], []);
    await flush();
    check('notifier: start uses yellow icon', () => {
        assert.strictEqual(captured.notifications.length, 1);
        assert.ok(captured.notifications[0].toastXml.includes('alert_yellow.png'));
        assert.deepStrictEqual(captured.sounds, ['alert']);
    });
    check('notifier: start title names the alert type without repeating the word alert', () => {
        const text = toastText(0);
        assert.ok(text.startsWith('Увага: повітряна тривога'), text);
        assert.ok(!text.includes('Тривога: повітряна тривога'), text);
    });
    reset();

    offset += 5000;
    notifier.processAlerts([alertAt('red', [YELLOW, RED])], []);
    await flush();
    check('notifier: escalation is held by hysteresis', () => {
        assert.strictEqual(captured.notifications.length, 0);
        assert.deepStrictEqual(captured.sounds, []);
    });

    offset += 20000;
    notifier.processAlerts([alertAt('red', [YELLOW, RED])], []);
    await flush();
    check('notifier: escalation notifies with red icon and rising sound', () => {
        assert.strictEqual(captured.notifications.length, 1);
        const xml = captured.notifications[0].toastXml;
        assert.ok(xml.includes('alert.png') && !xml.includes('alert_yellow.png'));
        const text = toastText(0);
        assert.ok(text.includes('Рівень підвищено: Бахмутський район'), text);
        assert.ok(text.includes('Було: жовтий, стало: червоний'), text);
        assert.ok(text.includes('Ракетна загроза'), text);
        assert.deepStrictEqual(captured.sounds, ['up']);
    });
    reset();

    offset += 70000;
    notifier.processAlerts([alertAt('yellow', [YELLOW])], []);
    await flush();
    offset += 20000;
    notifier.processAlerts([alertAt('yellow', [YELLOW])], []);
    await flush();
    check('notifier: red level lifted notifies with yellow icon and falling sound', () => {
        assert.strictEqual(captured.notifications.length, 1);
        const text = toastText(0);
        assert.ok(captured.notifications[0].toastXml.includes('alert_yellow.png'));
        assert.ok(text.includes('Рівень знижено: Бахмутський район'), text);
        assert.ok(text.includes('Червоний рівень знято, лишається жовтий'), text);
        assert.deepStrictEqual(captured.sounds, ['down']);
    });
    reset();

    settings.alertLevelChangeNotifyEnabled = false;
    offset += 70000;
    notifier.processAlerts([alertAt('yellow', [YELLOW, RED])], []);
    await flush();
    offset += 20000;
    notifier.processAlerts([alertAt('yellow', [YELLOW, RED])], []);
    await flush();
    check('notifier: level notifications can be switched off', () => {
        assert.strictEqual(captured.notifications.length, 0);
        assert.deepStrictEqual(captured.sounds, []);
    });
    settings.alertLevelChangeNotifyEnabled = true;
    reset();

    offset += 5000;
    notifier.processAlerts([], []);
    await flush();
    check('notifier: all-clear mentions highest level', () => {
        assert.strictEqual(captured.notifications.length, 1);
        const text = toastText(0);
        assert.ok(captured.notifications[0].toastXml.includes('cancel.png'));
        assert.ok(text.includes('Відбій: повітряна тривога'), text);
        assert.ok(!text.includes('Відбій тривоги: повітряна тривога'), text);
        assert.ok(text.includes('Найвищий рівень: червоний'), text);
        assert.ok(!text.includes('червоний рівень'), text);
        assert.deepStrictEqual(captured.sounds, ['cancel']);
    });
    reset();

    const saved = JSON.parse(fs.readFileSync(path.join(tmpDir, 'alert_displayed.json'), 'utf-8'));
    check('notifier: persisted snapshot is empty after all-clear', () => assert.deepStrictEqual(saved, []));

    const district = (level, threats) => ({
        name: 'Шевченківський',
        startedAt: new Date(realNow() + offset - 20000).toISOString(),
        alertLevel: level,
        threats,
    });
    const yellowThreat = { level: 'yellow', description: 'Дронова загроза (жовтий рівень)' };
    const redThreat = { level: 'red', description: 'Ракетна загроза (червоний рівень)' };

    notifier.processKyivDistricts([district('yellow', [yellowThreat])]);
    await flush();
    check('kyiv: start notifies with yellow icon', () => {
        assert.strictEqual(captured.notifications.length, 1);
        assert.ok(captured.notifications[0].toastXml.includes('alert_yellow.png'));
    });
    reset();

    offset += 3000;
    notifier.processKyivDistricts([district('red', [redThreat, yellowThreat])]);
    offset += 20000;
    notifier.processKyivDistricts([district('red', [redThreat, yellowThreat])]);
    await flush();
    check('kyiv: escalation notifies once', () => {
        assert.strictEqual(captured.notifications.length, 1);
        const text = toastText(0);
        assert.ok(text.includes('Рівень підвищено: Шевченківський район'), text);
        assert.deepStrictEqual(captured.sounds, ['up']);
    });
    reset();

    offset += 5000;
    notifier.processKyivDistricts([]);
    await flush();
    check('kyiv: all-clear mentions highest level', () => {
        assert.strictEqual(captured.notifications.length, 1);
        assert.ok(toastText(0).includes('Найвищий рівень: червоний'), toastText(0));
    });
    reset();

    const massAlerts = [1, 2, 3].map((n) => ({ ...alertAt('yellow', [YELLOW]), id: `m-${n}-air_raid`, location_uid: n, location_title: `Район ${n}`, location_lat: `District ${n}` }));
    notifier.processAlerts(massAlerts, []);
    await flush();
    reset();
    offset += 5000;
    const raised = massAlerts.map((alert) => ({ ...alert, alert_level: 'red', threats: [YELLOW, RED] }));
    notifier.processAlerts(raised, []);
    offset += 20000;
    notifier.processAlerts(raised, []);
    await flush();
    check('notifier: mass level change gives one summary and one sound', () => {
        assert.strictEqual(captured.notifications.length, 1);
        const text = toastText(0);
        assert.ok(text.includes('Змін рівня тривоги: 3'), text);
        assert.ok(text.includes('Підвищено: 3'), text);
        assert.deepStrictEqual(captured.sounds, ['up']);
    });

    notifier.processAlerts([], []);
    await flush();
    reset();
    const bareAlert = (uid) => ({ ...alertAt(null, []), id: `m-${uid}-air_raid`, location_uid: uid, location_title: 'Вишгородський район', location_lat: 'Vyshhorodskyi District' });
    const waitPoll = () => new Promise((resolve) => setTimeout(resolve, 450));

    const early = bareAlert(200);
    notifier.processAlerts([early], [early]);
    await flush();
    check('level grace: a start without a level waits for the level and its sound waits with the toast', () => {
        assert.strictEqual(captured.notifications.length, 0, captured.notifications.map((n) => n.toastXml).join(' | '));
        assert.deepStrictEqual(captured.sounds, []);
    });
    const leveled = { ...early, alert_level: 'yellow', threats: [YELLOW] };
    notifier.processAlerts([leveled], [leveled]);
    await waitPoll();
    check('level grace: the toast carries the level that arrived during the wait', () => {
        assert.strictEqual(captured.notifications.length, 1);
        const text = toastText(0);
        assert.ok(captured.notifications[0].toastXml.includes('alert_yellow.png'), text);
        assert.ok(text.includes('Дронова загроза (жовтий рівень)'), text);
        assert.deepStrictEqual(captured.sounds, ['alert']);
    });
    check('sound sync: closing the toast stops exactly its own sound', () => {
        assert.strictEqual(captured.shown.length, 1);
        captured.shown[0].emit('close');
        assert.deepStrictEqual(captured.stops, [captured.shown[0]]);
    });
    reset();

    const late = bareAlert(201);
    notifier.processAlerts([late], [late]);
    await flush();
    offset += 21000;
    await waitPoll();
    check('level grace: without a level the toast still comes after the grace period', () => {
        const starts = captured.notifications.filter((entry) => /Увага/.test(entry.toastXml));
        assert.strictEqual(starts.length, 1);
        assert.ok(!starts[0].toastXml.includes('alert_yellow.png'));
    });
    reset();

    const gone = bareAlert(202);
    notifier.processAlerts([gone], [gone]);
    await flush();
    notifier.processAlerts([], []);
    await waitPoll();
    check('level grace: no start toast for an alert that ended during the wait', () => {
        assert.ok(!captured.notifications.some((entry) => /Увага/.test(entry.toastXml)));
    });

    notifier.processAlerts([], []);
    await flush();
    reset();
    notifier.configureThrottle({ perWindow: 3, criticalPerWindow: 2, digestDelayMs: 120, digestCooldownMs: 120 });
    offset += 20000;
    const wave = [];
    const addToWave = (uid, level) => {
        const alert = { ...alertAt(level, level ? [YELLOW] : []), id: `m-${uid}-air_raid`, location_uid: uid, location_title: `Область ${uid}`, location_lat: `Region ${uid}` };
        wave.push(alert);
        notifier.processAlerts([...wave], [...wave]);
    };
    for (let uid = 301; uid <= 308; uid++) {
        addToWave(uid, 'yellow');
        await flush();
    }
    check('throttle: only three individual start toasts at once, the rest wait for one digest', () => {
        const starts = captured.notifications.filter((entry) => /Увага/.test(entry.toastXml));
        assert.strictEqual(starts.length, 3);
        assert.ok(captured.sounds.length >= 3 && captured.sounds.every((name) => name === 'alert'));
    });
    await new Promise((resolve) => setTimeout(resolve, 250));
    check('throttle: the overflow arrives as one digest with locations and the highest level', () => {
        const digests = captured.notifications.filter((entry) => /Ще тривог: 5/.test(entry.toastXml));
        assert.strictEqual(digests.length, 1);
        const text = digests[0].toastXml.replace(/<[^>]+>/g, ' ').replace(/s+/g, ' ');
        assert.ok(text.includes('Локації: Область 304, Область 305, Область 306 та ще 2'), text);
        assert.ok(text.includes('Найвищий рівень: жовтий'), text);
        assert.strictEqual(captured.sounds.length, 4);
    });
    reset();

    offset += 70000;
    await new Promise((resolve) => setTimeout(resolve, 150));
    for (let uid = 311; uid <= 316; uid++) {
        addToWave(uid, 'yellow');
        await flush();
    }
    addToWave(321, 'red');
    addToWave(322, 'red');
    addToWave(323, 'red');
    await flush();
    check('throttle: a new red alert still gets its own toast beyond the limit, up to the critical allowance', () => {
        const texts = captured.notifications.map((entry) => entry.toastXml);
        assert.ok(texts.some((text) => /Область 321/.test(text)));
        assert.ok(texts.some((text) => /Область 322/.test(text)));
        assert.ok(!texts.some((text) => /Область 323/.test(text) && /Увага/.test(text)));
    });
    await new Promise((resolve) => setTimeout(resolve, 300));
    reset();

    notifier.configureThrottle({ perWindow: 1, criticalPerWindow: 1, digestDelayMs: 100, digestCooldownMs: 100 });
    offset += 70000;
    const solo = [];
    const addSolo = (uid) => {
        const alert = { ...alertAt('yellow', [YELLOW]), id: `m-${uid}-air_raid`, location_uid: uid, location_title: `Район ${uid}`, location_lat: `District ${uid}` };
        solo.push(alert);
        notifier.processAlerts([...solo], [...solo]);
    };
    addSolo(401);
    await flush();
    addSolo(402);
    await flush();
    await new Promise((resolve) => setTimeout(resolve, 250));
    check('throttle: a single queued event is delivered as an ordinary toast, not as a digest of one', () => {
        const texts = captured.notifications.map((entry) => entry.toastXml);
        assert.strictEqual(texts.filter((text) => /Увага/.test(text)).length, 2);
        assert.ok(!texts.some((text) => /Ще тривог/.test(text)));
    });
    notifier.configureThrottle({ perWindow: 1000, criticalPerWindow: 1000 });

    notifier.processAlerts([], []);
    await flush();
    reset();
    const delays = [];
    const realSetTimeout = global.setTimeout;
    global.setTimeout = (fn, ms, ...rest) => {
        delays.push(ms);
        return realSetTimeout(fn, ms, ...rest);
    };
    const mk = (uid, level) => ({
        ...alertAt(level, [level === 'red' ? RED : YELLOW]),
        id: `m-${uid}-air_raid`,
        location_uid: uid,
        location_title: `Область ${uid}`,
        location_lat: `Region ${uid}`,
    });
    const hasAlarm = (index) => captured.notifications[index].toastXml.includes('scenario="urgent"');
    const clearAll = async () => {
        notifier.processAlerts([], []);
        offset += 20000;
        notifier.processAlerts([], []);
        await flush();
        offset += 70000;
    };

    offset += 70000;
    notifier.processAlerts([mk(910, 'red')], [mk(910, 'red')]);
    await flush();
    check('emergency: a red start is an alarm toast that lives 25 seconds', () => {
        assert.strictEqual(captured.notifications.length, 1);
        assert.ok(hasAlarm(0));
        assert.ok(delays.includes(25000), String(delays));
    });
    notifier.processAlerts([], []);
    offset += 20000;
    notifier.processAlerts([], []);
    await flush();
    check('emergency: the start toast is taken down when the alert ends, the all-clear lives 15 seconds', () => {
        assert.strictEqual(captured.shown[0].closed, true);
        assert.ok(delays.includes(15000), String(delays));
    });
    reset();
    offset += 70000;

    notifier.processAlerts([mk(911, 'yellow')], [mk(911, 'yellow')]);
    await flush();
    check('emergency: a yellow start is an ordinary toast that lives 20 seconds in the red-only mode', () => {
        assert.ok(!hasAlarm(0));
        assert.ok(delays.includes(20000), String(delays));
    });
    await clearAll();
    reset();

    settings.notifyProfile = { startYellow: { emergency: true, seconds: 20 } };
    notifier.processAlerts([mk(912, 'yellow')], [mk(912, 'yellow')]);
    await flush();
    check('emergency: a yellow start set to emergency in the settings is an alarm too', () => assert.ok(hasAlarm(0)));
    await clearAll();
    reset();

    settings.notifyProfile = { startRed: { emergency: false, seconds: 30 } };
    notifier.processAlerts([mk(913, 'red')], [mk(913, 'red')]);
    await flush();
    check('emergency: a red start set to standard is an ordinary toast and keeps the chosen time', () => {
        assert.ok(!hasAlarm(0));
        assert.ok(delays.includes(30000), String(delays));
    });
    await clearAll();
    reset();
    delete settings.notifyProfile;

    const wave2 = [];
    for (let uid = 920; uid < 924; uid++) {
        wave2.push(mk(uid, 'red'));
        notifier.processAlerts([...wave2], [...wave2]);
        await flush();
    }
    check('emergency: at most three alarm toasts are open at once', () => {
        const starts = captured.notifications.filter((entry) => /Увага/.test(entry.toastXml));
        assert.strictEqual(starts.length, 4);
        const alarms = starts.map((entry) => entry.toastXml.includes('scenario="urgent"'));
        assert.ok(alarms[0]);
        assert.ok(!alarms[3]);
        assert.ok(alarms.filter(Boolean).length <= 3);
    });
    await clearAll();
    reset();
    notifier.processAlerts([mk(950, 'red')], [mk(950, 'red')]);
    await flush();
    check('details window: a single alert shows location, start and the notification time with a date', () => {
        assert.strictEqual(captured.shown.length, 1);
        captured.shown[0].emit('click');
        assert.strictEqual(captured.messages.length, 1);
        const detail = captured.messages[0].detail;
        assert.ok(detail.includes('Область 950'), detail);
        assert.ok(/Розпочалась: .*\d{2}\.\d{2}\.\d{4}/.test(detail), detail);
        assert.ok(/Час сповіщення: .*\d{2}\.\d{2}\.\d{4}.*\d{2}:\d{2}/.test(detail), detail);
        assert.ok(/Поточний рівень: червоний/.test(detail), detail);
        assert.ok(/Тривалість: /.test(detail), detail);
        assert.deepStrictEqual(captured.messages[0].buttons.map((button) => button.id), ['map', 'status', 'close']);
    });
    await flush();
    check('details window: the open map button opens the live map of Ukraine', () => {
        captured.nextChoice = 'map';
        captured.shown[0].emit('click');
        return flush().then(() => assert.deepStrictEqual(captured.maps, ['ukraine']));
    });
    await clearAll();
    reset();
    reset();
    notifier.processKyivDistricts([{ name: 'Шевченківський', startedAt: new Date(realNow() + offset - 120000).toISOString(), alertLevel: 'red', threats: [{ level: 'red', description: 'Ракетна загроза' }] }]);
    await flush();
    check('kyiv district: clicking a single district toast opens the details window with the level, threat and times', () => {
        assert.strictEqual(captured.shown.length, 1);
        captured.nextChoice = 'map';
        captured.shown[0].emit('click');
        assert.strictEqual(captured.messages.length, 1);
        const detail = captured.messages[0].detail;
        assert.ok(detail.includes('Шевченківський район'), detail);
        assert.ok(/Поточний рівень: червоний/.test(detail), detail);
        assert.ok(detail.includes('Ракетна загроза'), detail);
        assert.ok(/Розпочалась: /.test(detail) && /Час сповіщення: /.test(detail), detail);
    });
    await flush();
    check('kyiv district: the open map button opens the map in the Kyiv mode', () => assert.deepStrictEqual(captured.maps, ['kyiv']));
    notifier.processKyivDistricts([]);
    offset += 20000;
    notifier.processKyivDistricts([]);
    await flush();
    check('kyiv district: the all-clear toast opens details with the highest level and the whole duration', () => {
        const clear = captured.shown[captured.shown.length - 1];
        captured.messages.length = 0;
        clear.emit('click');
        assert.strictEqual(captured.messages.length, 1);
        const detail = captured.messages[0].detail;
        assert.ok(detail.includes('Шевченківський район'), detail);
        assert.ok(/Найвищий рівень: червоний/.test(detail), detail);
        assert.ok(/Тривалість: /.test(detail), detail);
    });
    reset();
    await clearAll();
    notifier.configureToasts({ urgentSupported: false });
    notifier.processAlerts([mk(960, 'red')], [mk(960, 'red')]);
    await flush();
    check('emergency: where urgent toasts are unsupported the emergency falls back to an alarm toast', () => {
        assert.strictEqual(captured.shown.length, 1);
        assert.ok(captured.notifications[0].toastXml.includes('scenario="alarm"'), captured.notifications[0].toastXml);
    });
    notifier.configureToasts({ urgentSupported: true });
    await clearAll();
    reset();
    const trio = [mk(940, 'yellow'), mk(941, 'red'), mk(942, 'yellow')];
    notifier.processAlerts(trio, trio);
    await flush();
    check('summary details: clicking a mass start toast lists every region, the red ones first', () => {
        assert.strictEqual(captured.shown.length, 1);
        captured.shown[0].emit('click');
        assert.strictEqual(captured.messages.length, 1);
        const lines = captured.messages[0].detail.split('\n');
        assert.ok(lines[0].startsWith('Час сповіщення: '), lines[0]);
        assert.ok(/\d{2}\.\d{2}\.\d{4}/.test(lines[0]) && /\d{2}:\d{2}/.test(lines[0]), lines[0]);
        assert.strictEqual(lines[1], '');
        const rows = lines.slice(2);
        assert.strictEqual(rows.length, 3);
        assert.ok(rows[0].startsWith('Область 941'), rows[0]);
        assert.ok(rows.some((row) => row.startsWith('Область 940')));
        assert.ok(rows.some((row) => row.startsWith('Область 942')));
        assert.ok(captured.messages[0].buttons.some((button) => button.id === 'status'));
    });
    await clearAll();
    global.setTimeout = realSetTimeout;
    reset();
    notifier.configureThrottle({ perWindow: 1000, criticalPerWindow: 1000 });
    settings.visualNotificationsEnabled = false;
    const silentOne = { ...alertAt('red', [YELLOW]), id: 'm-900-air_raid', location_uid: 900, location_title: 'Область 900', location_lat: 'Region 900' };
    notifier.processAlerts([silentOne], [silentOne]);
    await flush();
    check('sound sync: with visual notifications off the sound plays once on its own', () => {
        assert.strictEqual(captured.notifications.length, 0);
        assert.deepStrictEqual(captured.sounds, ['alert']);
    });
    settings.visualNotificationsEnabled = true;
    notifier.processAlerts([], []);
    await flush();

    Date.now = realNow;
    Module._load = originalLoad;
    fs.rmSync(tmpDir, { recursive: true, force: true });
    console.log(`\n${passed} checks passed`);
    process.exit(0);
}

run().catch((err) => {
    console.error(err);
    process.exit(1);
});
