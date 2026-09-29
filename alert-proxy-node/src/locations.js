// Copyright (c) 2024-2026 Serhii I. Myshko
// Licensed under the MIT License. See LICENSE for details.

const tree = require('../resources/locations.json');

let lookup = null;

function build() {
    const map = new Map();

    tree.states.forEach((state) => {
        map.set(String(state.uid), {
            uid: state.uid,
            type: 'state',
            name: state.stateName,
            nameEn: state.stateNameLat,
            stateUid: state.uid,
        });

        state.districts.forEach((district) => {
            map.set(String(district.uid), {
                uid: district.uid,
                type: 'district',
                name: district.districtName,
                nameEn: district.districtNameLat,
                stateUid: state.uid,
            });

            district.communities.forEach((community) => {
                map.set(String(community.uid), {
                    uid: community.uid,
                    type: 'community',
                    name: community.communityName,
                    nameEn: community.communityNameLat,
                    stateUid: state.uid,
                    districtUid: district.uid,
                });
            });
        });
    });

    return map;
}

function getLocationLookup() {
    if (!lookup) lookup = build();
    return lookup;
}

module.exports = { getLocationLookup };
