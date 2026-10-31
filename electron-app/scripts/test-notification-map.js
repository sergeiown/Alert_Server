// Copyright (c) 2024-2026 Serhii I. Myshko
// Licensed under the MIT License. See LICENSE for details.

const assert = require('node:assert');
const Module = require('node:module');
const path = require('node:path');

const root = path.join(__dirname, '..');
const mocks = {
    electron: { BrowserWindow: class {}, nativeTheme: { shouldUseDarkColors: false } },
    './appPaths': {
        getUserDataFile: (name) => path.join(root, 'tmp-notification-map', name),
        getResourcePath: (...parts) => path.join(root, 'resources', ...parts),
    },
};
const originalLoad = Module._load;
Module._load = function patched(request, parent, isMain) {
    if (Object.prototype.hasOwnProperty.call(mocks, request)) return mocks[request];
    return originalLoad.call(this, request, parent, isMain);
};

const { resolveSelection } = require(path.join(root, 'src/main/services/notificationMap.js'));

function check(name, fn) {
    fn();
    console.log(`ok - ${name}`);
}

check('a district alert highlights the district outline, not the whole oblast', () => {
    const selection = resolveSelection([{ stateUid: 14, districtName: 'Вишгородський район' }]);
    assert.deepStrictEqual(selection.isoCodes, []);
    assert.strictEqual(selection.raionPaths.length, 1);
    assert.ok(selection.raionPaths[0].startsWith('M') && selection.raionPaths[0].endsWith('Z'));
});

check('an oblast alert still highlights the oblast', () => {
    assert.deepStrictEqual(resolveSelection([14]).isoCodes, ['UA-32']);
    assert.deepStrictEqual(resolveSelection([{ stateUid: 31 }]).isoCodes, ['UA-30']);
});

check('a district without outline data falls back to its oblast', () => {
    const selection = resolveSelection([{ stateUid: 29, districtName: 'м. Севастополь' }]);
    assert.deepStrictEqual(selection.isoCodes.sort(), ['UA-40', 'UA-43']);
    assert.deepStrictEqual(selection.raionPaths, []);
});

check('renamed districts are found under both names', () => {
    const oldName = resolveSelection([{ stateUid: 18, districtName: 'Новоград-Волинський район' }]);
    const newName = resolveSelection([{ stateUid: 18, districtName: 'Звягельський район' }]);
    assert.strictEqual(oldName.raionPaths.length, 1);
    assert.deepStrictEqual(oldName.raionPaths, newName.raionPaths);
});

check('mixed selections combine oblasts and districts without duplicates', () => {
    const selection = resolveSelection([
        { stateUid: 14, districtName: 'Вишгородський район' },
        { stateUid: 14, districtName: 'Вишгородський район' },
        { stateUid: 9 },
    ]);
    assert.strictEqual(selection.raionPaths.length, 1);
    assert.deepStrictEqual(selection.isoCodes, ['UA-12']);
});

Module._load = originalLoad;
process.exit(0);
