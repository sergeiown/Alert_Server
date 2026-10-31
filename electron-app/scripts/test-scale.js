// Copyright (c) 2024-2026 Serhii I. Myshko
// Licensed under the MIT License. See LICENSE for details.

const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const Module = require('node:module');

const root = path.join(__dirname, '..');
const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'alert-scale-'));
fs.writeFileSync(
    path.join(tmpDir, 'discovered_locations.json'),
    JSON.stringify({ 9990001: { type: 'city', title: 'Тестове місто', oblast: 'Київська область', firstSeenAt: '2026-01-01T00:00:00.000Z' } })
);

const tree = JSON.parse(fs.readFileSync(path.join(root, 'resources', 'data', 'locations.json'), 'utf-8'));
const everyUid = [];
tree.states.forEach((state) => {
    everyUid.push(state.uid);
    state.districts.forEach((district) => {
        everyUid.push(district.uid);
        district.communities.forEach((community) => everyUid.push(community.uid));
    });
});

const mocks = {
    electron: { app: { getPath: () => tmpDir } },
    './appPaths': {
        getUserDataFile: (name) => path.join(tmpDir, name),
        getResourcePath: (...parts) => path.join(root, 'resources', ...parts),
    },
    './regionsStore': { getSelectedUids: () => everyUid },
};
const originalLoad = Module._load;
Module._load = function patched(request, parent, isMain) {
    if (Object.prototype.hasOwnProperty.call(mocks, request)) return mocks[request];
    return originalLoad.call(this, request, parent, isMain);
};

const { filterAlerts, getAlertCoverageUids, getLocationLookup } = require(path.join(root, 'src/main/services/locationFilter.js'));

function timed(label, fn) {
    const started = process.hrtime.bigint();
    const value = fn();
    const ms = Number(process.hrtime.bigint() - started) / 1e6;
    console.log(`ok - ${label} (${ms.toFixed(0)} ms)`);
    return { value, ms };
}

const lookup = getLocationLookup();
const communityUids = [...lookup.entries()].filter(([, info]) => info.type === 'community').map(([uid]) => uid);
const alerts = Array.from({ length: 80 }, (_, index) => {
    const uid = communityUids[(index * 17) % communityUids.length];
    return { id: `a-${index}`, location_uid: uid, location_title: 'x', location_oblast: 'Київська область', alert_type: 'air_raid', started_at: new Date().toISOString() };
});

const filtered = timed('every location selected: 80 alerts are matched in one pass', () => filterAlerts({ alerts }));
assert.strictEqual(filtered.value.length, 80);
assert.ok(filtered.ms < 200, `filtering took ${filtered.ms} ms`);

const sweep = timed('every location selected: a coverage check of every location against every alert', () => {
    let hits = 0;
    everyUid.forEach((uid) => {
        alerts.forEach((alert) => {
            if (getAlertCoverageUids(alert).includes(String(uid))) hits += 1;
        });
    });
    return hits;
});
assert.ok(sweep.value >= 80);
assert.ok(sweep.ms < 1500, `coverage sweep took ${sweep.ms} ms`);

const { normalizeSelection } = require(path.join(root, 'src/main/services/selectionNormalizer.js'));

const everything = timed('every location selected: the stored selection collapses to the oblasts', () => normalizeSelection(everyUid));
assert.strictEqual(everything.value.length, tree.states.length);
assert.deepStrictEqual(new Set(everything.value), new Set(tree.states.map((state) => state.uid)));

const onlyCommunities = timed('every community selected one by one: the selection collapses to districts and oblasts', () => normalizeSelection(communityUids.map(Number)));
const communitySet = new Set(communityUids.map(Number));
assert.ok(onlyCommunities.value.every((uid) => !communitySet.has(uid)));
assert.ok(onlyCommunities.value.length <= tree.states.reduce((sum, state) => sum + state.districts.length, 0) + tree.states.length);

const firstDistrict = tree.states[0].districts[0];
const district = normalizeSelection(firstDistrict.communities.map((community) => community.uid));
assert.deepStrictEqual(district, [firstDistrict.uid]);
console.log('ok - all communities of a district collapse to the district');

const partial = normalizeSelection(firstDistrict.communities.slice(0, 1).map((community) => community.uid));
assert.strictEqual(partial.length, 1);
console.log('ok - a partial selection is left alone');

const withUnknown = normalizeSelection([9990001, tree.states[1].uid]);
assert.deepStrictEqual(new Set(withUnknown), new Set([9990001, tree.states[1].uid]));
console.log('ok - locations that are not in the tree survive');

Module._load = originalLoad;
fs.rmSync(tmpDir, { recursive: true, force: true });
process.exit(0);
