// Copyright (c) 2024-2026 Serhii I. Myshko
// Licensed under the MIT License. See LICENSE for details.

const assert = require('node:assert');
const lib = require('../src/lib');
const { buildDirectory } = require('../src/mergeCore');
const tree = require('../resources/locations.json');
const states = require('../resources/states.json');

function check(name, fn) {
    fn();
    console.log(`PASS: ${name}`);
}

check('a valid active alerts body gives the alerts array', () => {
    assert.deepStrictEqual(lib.parseActiveAlerts('{"alerts":[{"id":1}]}'), [{ id: 1 }]);
    assert.deepStrictEqual(lib.parseActiveAlerts('{"alerts":[]}'), []);
});

check('anything that is not an object with an alerts array is rejected', () => {
    assert.strictEqual(lib.parseActiveAlerts('<html>blocked</html>'), null);
    assert.strictEqual(lib.parseActiveAlerts('{"data":[]}'), null);
    assert.strictEqual(lib.parseActiveAlerts('{"alerts":null}'), null);
    assert.strictEqual(lib.parseActiveAlerts('[]'), null);
    assert.strictEqual(lib.parseActiveAlerts('null'), null);
    assert.strictEqual(lib.parseActiveAlerts(''), null);
});

check('the backoff doubles from a minute, honours retry-after and stops at fifteen minutes', () => {
    assert.strictEqual(lib.backoffDelayMs(0, NaN), 60 * 1000);
    assert.strictEqual(lib.backoffDelayMs(1, NaN), 120 * 1000);
    assert.strictEqual(lib.backoffDelayMs(2, 300), 300 * 1000);
    assert.strictEqual(lib.backoffDelayMs(0, 600), 600 * 1000);
    assert.strictEqual(lib.backoffDelayMs(10, NaN), 15 * 60 * 1000);
    assert.strictEqual(lib.backoffDelayMs(0, 7200), 15 * 60 * 1000);
});

check('state and district names contain no mixed latin and cyrillic letters', () => {
    const mixed = (text) => /[A-Za-z]/.test(text) && /[А-Яа-яІіЇїЄєҐґ]/.test(text);
    const names = [];
    tree.states.forEach((state) => {
        names.push(state.stateName);
        state.districts.forEach((district) => names.push(district.districtName));
    });
    Object.values(states).forEach((name) => names.push(name));
    assert.deepStrictEqual(names.filter(mixed), []);
});

check('the directory knows Crimea and Sevastopol under the names Neptun uses', () => {
    const directory = buildDirectory(tree);
    assert.ok(directory.stateByName.get('Автономна Республіка Крим'));
    const sevastopol = directory.nameAliases.get('Севастополь');
    assert.ok(sevastopol);
    assert.strictEqual(directory.byUid.get(sevastopol).type, 'district');
});

check('rows with hidden or inferred publication status stay out of the interception figures', () => {
    const attacks = [
        { time_start: '2026-08-01T01:00:00', model: 'Shahed-136', launched: '100', destroyed: '90', status_data: '' },
        { time_start: '2026-08-12T01:00:00', model: 'Shahed-136', launched: '', destroyed: '', status_data: 'hidden' },
        { time_start: '2026-08-13T01:00:00', model: 'Shahed-136', launched: '40', destroyed: '40', status_data: 'launched inferred from destroyed' },
        { time_start: '2026-08-14T01:00:00', model: 'Shahed-136', launched: '10', destroyed: '5', status_data: 'published' },
    ];
    const stats = lib.buildWeaponStats(attacks, [{ model: 'Shahed-136', category: 'uav' }], 5);
    assert.deepStrictEqual(stats.totals, { launched: 110, destroyed: 95 });
    assert.deepStrictEqual(stats.unpublished, { rows: 2, hiddenRows: 1, inferredRows: 1, from: '2026-08-12', to: '2026-08-13' });
    assert.strictEqual(stats.dateRange.to, '2026-08-14');
});

const occupied = require('../src/occupied');

check('the age of the DeepState file counts from the date in its name, not from our last check', () => {
    const now = Date.UTC(2026, 9, 26, 12, 0, 0);
    assert.strictEqual(occupied.dataAgeDays('20261026', now), 0);
    assert.strictEqual(occupied.dataAgeDays('20261025', now), 1);
    assert.strictEqual(occupied.dataAgeDays('20261020', now), 6);
    assert.strictEqual(occupied.dataAgeDays(null, now), null);
    assert.strictEqual(occupied.dataAgeDays('garbage', now), null);
});

check('only polygon geometry collections are accepted as the occupied territory file', () => {
    const polygon = { type: 'Polygon', coordinates: [[[0, 0], [1, 0], [1, 1], [0, 0]]] };
    assert.ok(occupied.isMapGeojson({ type: 'FeatureCollection', features: [{ type: 'Feature', properties: {}, geometry: polygon }] }));
    assert.ok(occupied.isMapGeojson({ type: 'Feature', geometry: { type: 'MultiPolygon', coordinates: [polygon.coordinates] } }));
    assert.ok(!occupied.isMapGeojson({ type: 'FeatureCollection', features: [] }));
    assert.ok(!occupied.isMapGeojson({ type: 'FeatureCollection', features: [{ type: 'Feature', geometry: { type: 'Point', coordinates: [0, 0] } }] }));
    assert.ok(!occupied.isMapGeojson({ error: 'rate limited' }));
    assert.ok(!occupied.isMapGeojson(null));
});

check('a renamed district is still found under its previous name and the old Luhansk uids are all present', () => {
    const directory = buildDirectory(tree);
    const luhansk = 'Луганська область';
    assert.strictEqual(directory.districtByKey.get(`${luhansk}|Сіверськодонецький район`), '84');
    assert.strictEqual(directory.districtByKey.get(`${luhansk}|Сєвєродонецький район`), '84');
    ['1801', '1802', '1803', '1804', '1901', '1911'].forEach((uid) => assert.ok(directory.byUid.has(uid), uid));
});

check('with no published rows the date range still comes from the whole dataset', () => {
    const attacks = [
        { time_start: '2026-08-12T01:00:00', model: 'Shahed-136', launched: '', destroyed: '', status_data: 'hidden' },
        { time_start: '2026-08-14T01:00:00', model: 'Shahed-136', launched: '', destroyed: '', status_data: 'hidden' },
    ];
    const stats = lib.buildWeaponStats(attacks, [], 5);
    assert.deepStrictEqual(stats.dateRange, { from: '2026-08-12', to: '2026-08-14' });
    assert.deepStrictEqual(stats.totals, { launched: 0, destroyed: 0 });
});
