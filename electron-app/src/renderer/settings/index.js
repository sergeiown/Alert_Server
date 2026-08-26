// Copyright (c) 2024-2026 Serhii I. Myshko
// Licensed under the MIT License. See LICENSE for details.

import { createRegionTree } from './components/RegionTree.js';
import { createUkraineMap } from './components/UkraineMap.js';

let mapInstance = null;

const treeContainer = document.getElementById('tree');
const mapContainer = document.getElementById('map-container');
const searchInput = document.getElementById('search');
const summary = document.getElementById('summary');
const clearRegionsButton = document.getElementById('clearRegionsButton');
const runAtStartupInput = document.getElementById('runAtStartup');
const visualNotificationsEnabledInput = document.getElementById('visualNotificationsEnabled');
const activeAlertNotifyEnabledInput = document.getElementById('activeAlertNotifyEnabled');
const showLiveMapOnAlertInput = document.getElementById('showLiveMapOnAlert');
const forecastNotifyEnabledInput = document.getElementById('forecastNotifyEnabled');
const forecastNotifyLookaheadMinutesInput = document.getElementById('forecastNotifyLookaheadMinutes');
const alertSoundModeInput = document.getElementById('alertSoundMode');
const alertSoundCountInput = document.getElementById('alertSoundCount');
const massAttackThresholdInput = document.getElementById('massAttackThreshold');
const updateCheckIntervalHoursInput = document.getElementById('updateCheckIntervalHours');
const languageInput = document.getElementById('language');
const themeInput = document.getElementById('theme');

function applyStrings(strings) {
    document.title = strings.windowTitle;
    document.getElementById('runAtStartupLabel').textContent = strings.runAtStartupLabel;
    document.getElementById('visualNotificationsLabel').textContent = strings.visualNotificationsLabel;
    document.getElementById('activeAlertNotifyLabel').textContent = strings.activeAlertNotifyLabel;
    document.getElementById('showLiveMapOnAlertLabel').textContent = strings.showLiveMapOnAlertLabel;
    document.getElementById('settingsForecastNotifyLabel').textContent = strings.settingsForecastNotifyLabel;
    document.getElementById('forecastNotifyLookaheadLabel').textContent = strings.forecastNotifyLookaheadLabel;
    document.getElementById('alertSoundLabel').textContent = strings.alertSoundLabel;
    document.getElementById('alertSoundModeNoneOption').textContent = strings.alertSoundModeNone;
    document.getElementById('alertSoundModeSirenOption').textContent = strings.alertSoundModeSiren;
    document.getElementById('alertSoundModeVoiceOption').textContent = strings.alertSoundModeVoice;
    document.getElementById('alertSoundCountLabel').textContent = strings.alertSoundCountLabel;
    document.getElementById('massAttackThresholdLabel').textContent = strings.massAttackThresholdLabel;
    document.getElementById('updateCheckIntervalLabel').textContent = strings.updateCheckIntervalLabel;
    document.getElementById('languageLabel').textContent = strings.languageLabel;
    document.getElementById('themeLabel').textContent = strings.themeLabel;
    document.getElementById('themeLightOption').textContent = strings.themeLight;
    document.getElementById('themeDarkOption').textContent = strings.themeDark;
    document.getElementById('themeSystemOption').textContent = strings.themeSystem;
    document.getElementById('regionsHeader').textContent = strings.regionsHeader;
    searchInput.placeholder = strings.searchPlaceholder;
    clearRegionsButton.textContent = strings.clearRegionsButton;
    return strings;
}

function formatSummary(template, selected, total) {
    return template.replace('{selected}', selected).replace('{total}', total);
}

function updateNotifyDisabledState() {
    const visualOn = visualNotificationsEnabledInput.checked;
    activeAlertNotifyEnabledInput.disabled = !visualOn;
    showLiveMapOnAlertInput.disabled = !visualOn || !activeAlertNotifyEnabledInput.checked;
    forecastNotifyEnabledInput.disabled = !visualOn;
    forecastNotifyLookaheadMinutesInput.disabled = !visualOn || !forecastNotifyEnabledInput.checked;
}

function updateSoundCountDisabledState() {
    alertSoundCountInput.disabled = alertSoundModeInput.value === 'none';
}

async function initGeneralSettings(settings) {
    visualNotificationsEnabledInput.checked = settings.visualNotificationsEnabled;
    activeAlertNotifyEnabledInput.checked = settings.activeAlertNotifyEnabled;
    showLiveMapOnAlertInput.checked = settings.showLiveMapOnAlert;
    forecastNotifyEnabledInput.checked = settings.forecastNotifyEnabled;
    forecastNotifyLookaheadMinutesInput.value = settings.forecastNotifyLookaheadMinutes;
    alertSoundModeInput.value = settings.alertSoundMode;
    alertSoundCountInput.value = settings.alertSoundCount;
    massAttackThresholdInput.value = settings.massAttackThreshold;
    updateCheckIntervalHoursInput.value = settings.updateCheckIntervalHours;
    languageInput.value = settings.language;
    themeInput.value = settings.theme;
    runAtStartupInput.checked = await window.alertServer.getLoginItem();

    updateNotifyDisabledState();
    updateSoundCountDisabledState();

    visualNotificationsEnabledInput.addEventListener('change', () => {
        window.alertServer.setSetting('visualNotificationsEnabled', visualNotificationsEnabledInput.checked);
        updateNotifyDisabledState();
    });
    activeAlertNotifyEnabledInput.addEventListener('change', () => {
        window.alertServer.setSetting('activeAlertNotifyEnabled', activeAlertNotifyEnabledInput.checked);
        updateNotifyDisabledState();
    });
    showLiveMapOnAlertInput.addEventListener('change', () => {
        window.alertServer.setSetting('showLiveMapOnAlert', showLiveMapOnAlertInput.checked);
    });
    forecastNotifyEnabledInput.addEventListener('change', () => {
        window.alertServer.setSetting('forecastNotifyEnabled', forecastNotifyEnabledInput.checked);
        updateNotifyDisabledState();
    });
    forecastNotifyLookaheadMinutesInput.addEventListener('change', () => {
        const minutes = Math.max(1, Math.min(600, Number(forecastNotifyLookaheadMinutesInput.value) || 120));
        forecastNotifyLookaheadMinutesInput.value = minutes;
        window.alertServer.setSetting('forecastNotifyLookaheadMinutes', minutes);
    });
    alertSoundModeInput.addEventListener('change', () => {
        window.alertServer.setSetting('alertSoundMode', alertSoundModeInput.value);
        updateSoundCountDisabledState();
    });
    alertSoundCountInput.addEventListener('change', () => {
        const count = Math.max(1, Math.min(10, Number(alertSoundCountInput.value) || 1));
        alertSoundCountInput.value = count;
        window.alertServer.setSetting('alertSoundCount', count);
    });
    massAttackThresholdInput.addEventListener('change', () => {
        const threshold = Math.max(50, Math.min(100, Number(massAttackThresholdInput.value) || 75));
        massAttackThresholdInput.value = threshold;
        window.alertServer.setSetting('massAttackThreshold', threshold);
    });
    updateCheckIntervalHoursInput.addEventListener('change', () => {
        const hours = Math.max(1, Math.min(168, Number(updateCheckIntervalHoursInput.value) || 24));
        updateCheckIntervalHoursInput.value = hours;
        window.alertServer.setSetting('updateCheckIntervalHours', hours);
    });
    languageInput.addEventListener('change', () => {
        window.alertServer.setSetting('language', languageInput.value);
        if (mapInstance) mapInstance.setLanguage(languageInput.value);
    });
    themeInput.addEventListener('change', () => {
        window.alertServer.setSetting('theme', themeInput.value);
    });
    runAtStartupInput.addEventListener('change', async () => {
        runAtStartupInput.checked = await window.alertServer.setLoginItem(runAtStartupInput.checked);
    });
}

function totalRegionsCount(tree) {
    let count = 0;
    tree.states.forEach((state) => {
        count += 1;
        state.districts.forEach((district) => {
            count += 1;
            count += district.communities.length;
        });
    });
    return count;
}

function districtUidsUnder(district) {
    return [district.uid, ...district.communities.map((c) => c.uid)];
}

function stateUidsUnder(state) {
    return [state.uid, ...state.districts.flatMap(districtUidsUnder)];
}

function collectUidsUnder(uid, tree) {
    for (const state of tree.states) {
        if (state.uid === uid) return stateUidsUnder(state);
        for (const district of state.districts) {
            if (district.uid === uid) return districtUidsUnder(district);
            if (district.communities.some((c) => c.uid === uid)) return [uid];
        }
    }
    return [uid];
}

(async () => {
    const strings = applyStrings(await window.alertServer.getStrings());
    const settings = await window.alertServer.getSettings();
    await initGeneralSettings(settings);

    const tree = await window.alertServer.getRegionTree();
    const selectedUids = await window.alertServer.getSelectedRegions();
    const total = totalRegionsCount(tree);

    function updateSummary(selectedCount) {
        summary.textContent = formatSummary(strings.selectedSummary, selectedCount, total);
    }

    let selectedCount = selectedUids.length;
    const selectedUidSet = new Set(selectedUids.map(String));
    let regionTree = null;

    async function applyToggle(uid, explicitChecked) {
        const checked = explicitChecked !== undefined ? explicitChecked : !selectedUidSet.has(String(uid));
        const uidsInScope = collectUidsUnder(Number(uid), tree);

        const changed = uidsInScope.filter((u) => {
            const key = String(u);
            const isCurrentlySelected = selectedUidSet.has(key);
            return checked ? !isCurrentlySelected : isCurrentlySelected;
        });

        if (!changed.length) return checked;

        changed.forEach((u) => {
            const key = String(u);
            if (checked) selectedUidSet.add(key);
            else selectedUidSet.delete(key);
        });

        await window.alertServer.setSelectedRegions(Array.from(selectedUidSet).map(Number));
        selectedCount = selectedUidSet.size;
        updateSummary(selectedCount);

        changed.forEach((u) => {
            regionTree.setUidChecked(u, checked);
            if (mapInstance) mapInstance.setSelected(u, checked);
        });

        return checked;
    }

    regionTree = createRegionTree(treeContainer, tree, selectedUids, settings.language, (uid, checked) =>
        applyToggle(uid, checked)
    );

    const mapSvg = await window.alertServer.getMapSvg();
    mapInstance = createUkraineMap(mapContainer, mapSvg, tree, selectedUids, settings.language, (uid) =>
        applyToggle(uid)
    );

    updateSummary(selectedCount);

    clearRegionsButton.addEventListener('click', async () => {
        if (!selectedUidSet.size) return;
        if (!confirm(strings.clearRegionsConfirm)) return;

        const uidsToClear = Array.from(selectedUidSet);
        await window.alertServer.setSelectedRegions([]);

        uidsToClear.forEach((uid) => {
            const numericUid = Number(uid);
            regionTree.setUidChecked(numericUid, false);
            if (mapInstance) mapInstance.setSelected(numericUid, false);
        });

        selectedUidSet.clear();
        selectedCount = 0;
        updateSummary(selectedCount);
    });

    let searchTimer = null;
    searchInput.addEventListener('input', () => {
        clearTimeout(searchTimer);
        searchTimer = setTimeout(() => regionTree.setQuery(searchInput.value), 150);
    });
})();
