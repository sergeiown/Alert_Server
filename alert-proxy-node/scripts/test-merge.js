// Copyright (c) 2024-2026 Serhii I. Myshko
// Licensed under the MIT License. See LICENSE for details.

const assert = require('assert');
const tree = require('../resources/locations.json');
const { loadConfig, buildDirectory, createMerger, signatureOf } = require('../src/mergeCore');

const directory = buildDirectory(tree);
const cfg = loadConfig({});

const VINNYTSIA_STATE = '4';
const VINNYTSIA_DISTRICT = '36';
const VINNYTSIA_COMMUNITY = '154';
const DISTRICT_NAME = directory.byUid.get(VINNYTSIA_DISTRICT).name;
const STATE_NAME = directory.byUid.get(VINNYTSIA_STATE).name;

const T0 = Date.UTC(2026, 9, 20, 12, 0, 0);
const iso = (ms) => new Date(ms).toISOString();

function iaAlert(uid, extra = {}) {
    return {
        id: Number(uid),
        location_uid: String(uid),
        location_title: directory.byUid.get(String(uid)).name,
        location_oblast: STATE_NAME,
        location_type: 'raion',
        alert_type: 'air_raid',
        started_at: iso(T0 - 600000),
        finished_at: null,
        notes: null,
        ...extra,
    };
}

function uaRegion(uid, levels, type = 'AIR', lastUpdate = T0 - 300000) {
    return {
        regionId: String(uid),
        regionName: directory.byUid.get(String(uid)).name,
        lastUpdate: iso(lastUpdate),
        activeAlerts: [{ type, lastUpdate: iso(lastUpdate), activeAlertLevels: levels }],
    };
}

function sources({ ia, ua, np, now, webhook = 'healthy' }) {
    return {
        ia: ia ? { alerts: ia.alerts, fetchedAt: now - (ia.age ?? 1000) } : null,
        ua: ua ? { regions: ua.regions, fetchedAt: now - (ua.age ?? 1000) } : null,
        np: np ? { payload: np.payload, fetchedAt: now - (np.age ?? 1000) } : null,
        webhook,
    };
}

function newMerger(log) {
    return createMerger({ cfg, directory, log });
}

function run(name, fn) {
    try {
        fn();
        console.log(`PASS: ${name}`);
    } catch (err) {
        console.error(`FAIL: ${name}`);
        console.error(err.stack);
        process.exitCode = 1;
    }
}

run('IA only: alert starts with IA fields and no level', () => {
    const merger = newMerger();
    const result = merger.update(T0, sources({ now: T0, ia: { alerts: [iaAlert(VINNYTSIA_DISTRICT, { notes: 'note' })] }, ua: { regions: [] }, np: { payload: { raions: [], oblasts: [] } } }));
    assert.strictEqual(result.alerts.length, 1);
    const alert = result.alerts[0];
    assert.strictEqual(alert.id, `m-${VINNYTSIA_DISTRICT}-air_raid`);
    assert.strictEqual(alert.location_uid, VINNYTSIA_DISTRICT);
    assert.deepStrictEqual(alert.sources, ['ia']);
    assert.strictEqual(alert.alert_level, null);
    assert.deepStrictEqual(alert.threats, []);
    assert.strictEqual(alert.notes, 'note');
    assert.strictEqual(alert.location_type, 'raion');
    assert.strictEqual(alert.started_at, iso(T0 - 600000));
    assert.strictEqual(result.degraded, false);
    assert.strictEqual(result.ready, true);
});

run('UA only: alert starts, level and threats from UA, started_at from earliest createdAt', () => {
    const merger = newMerger();
    const levels = [
        { alertLevel: 'Yellow', reason: 'drone threat', createdAt: iso(T0 - 900000) },
        { alertLevel: 'Red', reason: 'missile threat', createdAt: iso(T0 - 400000) },
    ];
    const result = merger.update(T0, sources({ now: T0, ia: { alerts: [] }, ua: { regions: [uaRegion(VINNYTSIA_DISTRICT, levels)] }, np: { payload: { raions: [], oblasts: [] } } }));
    assert.strictEqual(result.alerts.length, 1);
    const alert = result.alerts[0];
    assert.deepStrictEqual(alert.sources, ['ua']);
    assert.strictEqual(alert.alert_level, 'red');
    assert.strictEqual(alert.threats.length, 2);
    assert.strictEqual(alert.threats[0].level, 'yellow');
    assert.strictEqual(alert.started_at, iso(T0 - 900000));
    assert.strictEqual(alert.location_oblast, STATE_NAME);
    assert.strictEqual(alert.location_type, 'raion');
});

run('both sources: one alert, stable id, IA started_at wins', () => {
    const merger = newMerger();
    const input = sources({
        now: T0,
        ia: { alerts: [iaAlert(VINNYTSIA_DISTRICT)] },
        ua: { regions: [uaRegion(VINNYTSIA_DISTRICT, [{ alertLevel: 'yellow', reason: 'x', createdAt: iso(T0 - 100000) }])] },
        np: { payload: { raions: [], oblasts: [] } },
    });
    const result = merger.update(T0, input);
    assert.strictEqual(result.alerts.length, 1);
    assert.deepStrictEqual(result.alerts[0].sources, ['ia', 'ua']);
    assert.strictEqual(result.alerts[0].id, `m-${VINNYTSIA_DISTRICT}-air_raid`);
    assert.strictEqual(result.alerts[0].started_at, iso(T0 - 600000));
    assert.strictEqual(result.alerts[0].alert_level, 'yellow');
    const idAfterUaOnly = merger.update(T0 + 1000, sources({ now: T0 + 1000, ia: { alerts: [] }, ua: input.ua && { regions: input.ua.regions }, np: { payload: { raions: [], oblasts: [] } } })).alerts[0].id;
    assert.strictEqual(idAfterUaOnly, result.alerts[0].id);
});

run('clear is held for the confirmation window and then removed', () => {
    const merger = newMerger();
    const withAlert = (now) => sources({ now, ia: { alerts: [iaAlert(VINNYTSIA_DISTRICT)] }, ua: { regions: [] }, np: { payload: { raions: [], oblasts: [] } } });
    const without = (now) => sources({ now, ia: { alerts: [] }, ua: { regions: [] }, np: { payload: { raions: [], oblasts: [] } } });
    assert.strictEqual(merger.update(T0, withAlert(T0)).alerts.length, 1);
    assert.strictEqual(merger.update(T0 + 5000, without(T0 + 5000)).alerts.length, 1);
    assert.strictEqual(merger.update(T0 + 14000, without(T0 + 14000)).alerts.length, 1);
    assert.strictEqual(merger.update(T0 + 16000, without(T0 + 16000)).alerts.length, 0);
});

run('a clear that reappears inside the window never leaves the output', () => {
    const merger = newMerger();
    const withAlert = (now) => sources({ now, ia: { alerts: [iaAlert(VINNYTSIA_DISTRICT)] }, ua: { regions: [] }, np: { payload: { raions: [], oblasts: [] } } });
    const without = (now) => sources({ now, ia: { alerts: [] }, ua: { regions: [] }, np: { payload: { raions: [], oblasts: [] } } });
    merger.update(T0, withAlert(T0));
    merger.update(T0 + 8000, without(T0 + 8000));
    const back = merger.update(T0 + 12000, withAlert(T0 + 12000));
    assert.strictEqual(back.alerts.length, 1);
    assert.strictEqual(merger.update(T0 + 20000, withAlert(T0 + 20000)).alerts.length, 1);
});

run('stale IA freezes its last set without false clears, then expires after 30 min', () => {
    const merger = newMerger();
    const alerts = [iaAlert(VINNYTSIA_DISTRICT)];
    const base = (now, age) => sources({ now, ia: { alerts, age }, ua: { regions: [] }, np: { payload: { raions: [], oblasts: [] } } });
    assert.strictEqual(merger.update(T0, base(T0, 1000)).alerts.length, 1);

    const frozen = merger.update(T0 + 300000, base(T0 + 300000, 300000));
    assert.strictEqual(frozen.sources.ia.state, 'stale');
    assert.strictEqual(frozen.alerts.length, 1);
    assert.strictEqual(frozen.degraded, true);

    const stillFrozen = merger.update(T0 + 1500000, base(T0 + 1500000, 1500000));
    assert.strictEqual(stillFrozen.alerts.length, 1);

    merger.update(T0 + 1900000, base(T0 + 1900000, 1900000));
    const expired = merger.update(T0 + 1930000, base(T0 + 1930000, 1930000));
    assert.strictEqual(expired.sources.ia.state, 'down');
    assert.strictEqual(expired.alerts.length, 0);
    assert.strictEqual(expired.degraded, true);
});

run('stale UA freezes its set, UA alert stays visible', () => {
    const merger = newMerger();
    const regions = [uaRegion(VINNYTSIA_DISTRICT, [{ alertLevel: 'red', reason: 'r', createdAt: iso(T0 - 1000) }])];
    const base = (now, age) => sources({ now, ia: { alerts: [iaAlert(VINNYTSIA_COMMUNITY)] }, ua: { regions, age }, np: { payload: { raions: [], oblasts: [] } } });
    assert.strictEqual(merger.update(T0, base(T0, 1000)).alerts.length, 2);
    const later = merger.update(T0 + 300000, base(T0 + 300000, 300000));
    assert.strictEqual(later.sources.ua.state, 'stale');
    assert.strictEqual(later.alerts.length, 2);
    assert.strictEqual(later.degraded, true);
    assert.strictEqual(later.sources.ua.webhook, 'healthy');
});

run('Neptun never opens an alert on its own', () => {
    const merger = newMerger();
    const np = { payload: { raions: [{ key: 'k1', name: DISTRICT_NAME, oblast: STATE_NAME, level: 'yellow', since: iso(T0 - 100000), reasons: ['reason'] }], oblasts: [] } };
    const result = merger.update(T0, sources({ now: T0, ia: { alerts: [] }, ua: { regions: [] }, np }));
    assert.strictEqual(result.alerts.length, 0);
    assert.strictEqual(result.neptunOnly.length, 1);
    assert.strictEqual(result.neptunOnly[0].location_uid, VINNYTSIA_DISTRICT);
    assert.strictEqual(result.neptunOnly[0].level, 'yellow');
    assert.strictEqual(result.degraded, false);
});

run('Neptun becomes the presence source only when both official sources are down', () => {
    const merger = newMerger();
    const np = {
        payload: {
            raions: [{ key: 'k1', name: DISTRICT_NAME, oblast: STATE_NAME, level: 'red', since: iso(T0 - 100000), reasons: ['reason one'] }],
            oblasts: [],
        },
    };
    const result = merger.update(T0, sources({ now: T0, ia: { alerts: [], age: 400000 }, ua: { regions: [], age: 400000 }, np }));
    assert.strictEqual(result.degraded, true);
    assert.strictEqual(result.alerts.length, 1);
    const alert = result.alerts[0];
    assert.strictEqual(alert.location_uid, VINNYTSIA_DISTRICT);
    assert.strictEqual(alert.alert_type, 'air_raid');
    assert.deepStrictEqual(alert.sources, ['np']);
    assert.strictEqual(alert.alert_level, 'red');
    assert.strictEqual(alert.threats[0].source_message, 'reason one');
    assert.strictEqual(alert.started_at, iso(T0 - 100000));

    const oneBack = merger.update(T0 + 1000, sources({ now: T0 + 1000, ia: { alerts: [] }, ua: { regions: [], age: 400000 }, np }));
    assert.strictEqual(oneBack.neptunOnly.length, 1);
});

run('only one official source down: Neptun still does not open alerts', () => {
    const merger = newMerger();
    const np = { payload: { raions: [{ key: 'k1', name: DISTRICT_NAME, oblast: STATE_NAME, level: 'red', since: iso(T0), reasons: [] }], oblasts: [] } };
    const result = merger.update(T0, sources({ now: T0, ia: { alerts: [], age: 400000 }, ua: { regions: [] }, np }));
    assert.strictEqual(result.alerts.length, 0);
});

run('UA alert not confirmed by a fresh IA is excluded after the stuck window', () => {
    const logs = [];
    const merger = newMerger((message) => logs.push(message));
    const regions = [uaRegion(VINNYTSIA_DISTRICT, [{ alertLevel: 'yellow', reason: 'x', createdAt: iso(T0) }])];
    const at = (offset) => merger.update(T0 + offset, sources({ now: T0 + offset, ia: { alerts: [] }, ua: { regions }, np: { payload: { raions: [], oblasts: [] } } }));
    assert.strictEqual(at(0).alerts.length, 1);
    assert.strictEqual(at(899000).alerts.length, 1);
    assert.strictEqual(at(901000).alerts.length, 1);
    assert.strictEqual(at(916000).alerts.length, 0);
    assert.strictEqual(logs.length, 1);
});

run('UA district alert covered by an IA community alert inside it is not stuck', () => {
    const merger = newMerger();
    const regions = [uaRegion(VINNYTSIA_DISTRICT, [{ alertLevel: 'red', reason: 'x', createdAt: iso(T0) }])];
    const at = (offset) => merger.update(T0 + offset, sources({ now: T0 + offset, ia: { alerts: [iaAlert(VINNYTSIA_COMMUNITY)] }, ua: { regions }, np: { payload: { raions: [], oblasts: [] } } }));
    at(0);
    const late = at(40 * 60000);
    assert.strictEqual(late.alerts.length, 2);
});

run('community alert takes level and threats from the parent district', () => {
    const merger = newMerger();
    const np = {
        payload: {
            raions: [{ key: 'k1', name: DISTRICT_NAME, oblast: STATE_NAME, level: 'yellow', since: iso(T0 - 50000), reasons: ['district reason'] }],
            oblasts: [{ key: 'k2', name: STATE_NAME, level: 'red', since: iso(T0 - 50000), reasons: ['state reason'] }],
        },
    };
    const result = merger.update(T0, sources({ now: T0, ia: { alerts: [iaAlert(VINNYTSIA_COMMUNITY, { location_type: 'hromada' })] }, ua: { regions: [] }, np }));
    assert.strictEqual(result.alerts.length, 1);
    const alert = result.alerts[0];
    assert.strictEqual(alert.alert_level, 'yellow');
    assert.strictEqual(alert.threats.length, 1);
    assert.strictEqual(alert.threats[0].source_message, 'district reason');
    assert.deepStrictEqual(alert.sources, ['ia']);
});

run('community alert falls back to the state level when the district has none', () => {
    const merger = newMerger();
    const np = { payload: { raions: [], oblasts: [{ key: 'k2', name: STATE_NAME, level: 'red', since: iso(T0 - 50000), reasons: ['state reason'] }] } };
    const result = merger.update(T0, sources({ now: T0, ia: { alerts: [iaAlert(VINNYTSIA_COMMUNITY)] }, ua: { regions: [] }, np }));
    assert.strictEqual(result.alerts[0].alert_level, 'red');
});

run('Neptun level applies to air raids only', () => {
    const merger = newMerger();
    const np = { payload: { raions: [{ key: 'k1', name: DISTRICT_NAME, oblast: STATE_NAME, level: 'red', since: iso(T0), reasons: ['r'] }], oblasts: [] } };
    const result = merger.update(T0, sources({ now: T0, ia: { alerts: [iaAlert(VINNYTSIA_DISTRICT, { alert_type: 'artillery_shelling' })] }, ua: { regions: [] }, np }));
    assert.strictEqual(result.alerts[0].alert_level, null);
});

run('IA alert missing in UA is reported for the cross-source snapshot trigger', () => {
    const merger = newMerger();
    const result = merger.update(T0, sources({ now: T0, ia: { alerts: [iaAlert(VINNYTSIA_DISTRICT)] }, ua: { regions: [] }, np: { payload: { raions: [], oblasts: [] } } }));
    assert.deepStrictEqual(result.iaOnlyKeys, [`${VINNYTSIA_DISTRICT}:air_raid`]);
    const covered = merger.update(T0 + 1000, sources({ now: T0 + 1000, ia: { alerts: [iaAlert(VINNYTSIA_DISTRICT)] }, ua: { regions: [uaRegion(VINNYTSIA_STATE, [{ alertLevel: 'yellow', reason: 'x', createdAt: iso(T0) }])] }, np: { payload: { raions: [], oblasts: [] } } }));
    assert.deepStrictEqual(covered.iaOnlyKeys, []);
});

run('nothing is ready before any official source has data', () => {
    const merger = newMerger();
    const result = merger.update(T0, sources({ now: T0, np: { payload: { raions: [], oblasts: [] } } }));
    assert.strictEqual(result.ready, false);
    assert.strictEqual(result.sources.ia.state, 'down');
    assert.strictEqual(result.sources.ua.state, 'down');
});

run('ignored UA region ids and unknown UA types are dropped', () => {
    const merger = newMerger();
    const regions = [{ regionId: '0', regionName: 'x', lastUpdate: iso(T0), activeAlerts: [{ type: 'AIR', lastUpdate: iso(T0), activeAlertLevels: [] }] }, uaRegion(VINNYTSIA_DISTRICT, [], 'UNKNOWN')];
    const result = merger.update(T0, sources({ now: T0, ia: { alerts: [] }, ua: { regions }, np: { payload: { raions: [], oblasts: [] } } }));
    assert.strictEqual(result.alerts.length, 0);
});

run('signature ignores ages but reacts to alert changes', () => {
    const merger = newMerger();
    const input = (now, alerts) => sources({ now, ia: { alerts }, ua: { regions: [] }, np: { payload: { raions: [], oblasts: [] } } });
    const first = signatureOf(merger.update(T0, input(T0, [iaAlert(VINNYTSIA_DISTRICT)])));
    const second = signatureOf(merger.update(T0 + 1000, input(T0 + 1000, [iaAlert(VINNYTSIA_DISTRICT)])));
    assert.strictEqual(first, second);
    const third = signatureOf(merger.update(T0 + 2000, input(T0 + 2000, [iaAlert(VINNYTSIA_DISTRICT), iaAlert(VINNYTSIA_COMMUNITY)])));
    assert.notStrictEqual(first, third);
});

run('environment overrides apply and invalid values fall back', () => {
    const custom = loadConfig({ MERGE_CLEAR_CONFIRM_MS: '5000', MERGE_STUCK_MS: 'abc' });
    assert.strictEqual(custom.clearConfirmMs, 5000);
    assert.strictEqual(custom.stuckMs, cfg.stuckMs);
});
