// Copyright (c) 2024-2026 Serhii I. Myshko
// Licensed under the MIT License. See LICENSE for details.

const fs = require('fs');
const { getResourcePath } = require('./appPaths');

let structure = null;

function loadStructure() {
    const tree = JSON.parse(fs.readFileSync(getResourcePath('data', 'locations.json'), 'utf-8'));
    structure = tree.states.map((state) => ({
        uid: state.uid,
        districts: state.districts.map((district) => ({
            uid: district.uid,
            communities: district.communities.map((community) => community.uid),
        })),
    }));
}

function normalizeSelection(uids) {
    if (!structure) loadStructure();

    const selected = new Set(uids.map((uid) => (Number.isFinite(Number(uid)) ? Number(uid) : uid)));

    structure.forEach((state) => {
        state.districts.forEach((district) => {
            const complete = district.communities.length > 0 && district.communities.every((uid) => selected.has(uid));
            if (complete) selected.add(district.uid);
        });
        const completeState = state.districts.length > 0 && state.districts.every((district) => selected.has(district.uid));
        if (completeState) selected.add(state.uid);
    });

    structure.forEach((state) => {
        if (selected.has(state.uid)) {
            state.districts.forEach((district) => {
                selected.delete(district.uid);
                district.communities.forEach((uid) => selected.delete(uid));
            });
            return;
        }
        state.districts.forEach((district) => {
            if (selected.has(district.uid)) district.communities.forEach((uid) => selected.delete(uid));
        });
    });

    return Array.from(selected);
}

module.exports = { normalizeSelection };
