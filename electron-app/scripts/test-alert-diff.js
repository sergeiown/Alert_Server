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
const captured = { notifications: [], sounds: [], logs: [] };
const settings = {
    language: 'Ukrainian',
    visualNotificationsEnabled: true,
    activeAlertNotifyEnabled: true,
    showLiveMapOnAlert: false,
    alertSoundMode: 'siren',
    alertSoundCount: 1,
    alertLevelChangeNotifyEnabled: true,
};

class FakeNotification {
    constructor(options) {
        captured.notifications.push(options);
    }
    on() {}
    show() {}
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
        playAlertSound: () => captured.sounds.push('alert'),
        playAlertCancellationSound: () => captured.sounds.push('cancel'),
        playLevelUpSound: () => captured.sounds.push('up'),
        playLevelDownSound: () => captured.sounds.push('down'),
    },
    './locationFilter': { getHistoryFetchTarget: () => ({ stateUid: 1 }) },
    './notificationMap': { renderRegionMapImage: async () => null },
    './forecast': { formatDuration: (ms) => `${Math.round(ms / 60000)} хв` },
    '../windows/liveMapWindow': { openLiveMapWindow() {}, openLiveMapWindowInKyivMode() {} },
};

const originalLoad = Module._load;
Module._load = function patched(request, parent, isMain) {
    if (Object.prototype.hasOwnProperty.call(mocks, request)) return mocks[request];
    return originalLoad.call(this, request, parent, isMain);
};

const notifier = require(path.join(root, 'src/main/services/notifier.js'));

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
        assert.ok(text.includes('Жовтий -&gt; червоний рівень') || text.includes('Жовтий -> червоний рівень'), text);
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
        assert.ok(text.includes('Відбій тривоги: Повітряна тривога') || text.includes('Відбій тривоги'), text);
        assert.ok(text.includes('Найвищий рівень: червоний рівень'), text);
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
        assert.ok(toastText(0).includes('Найвищий рівень: червоний рівень'), toastText(0));
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
