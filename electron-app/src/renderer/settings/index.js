import { createRegionTree } from './components/RegionTree.js';

const treeContainer = document.getElementById('tree');
const searchInput = document.getElementById('search');
const summary = document.getElementById('summary');
const runAtStartupInput = document.getElementById('runAtStartup');
const trayMonoIconInput = document.getElementById('trayMonoIcon');
const forecastNotifyEnabledInput = document.getElementById('forecastNotifyEnabled');
const alertSoundModeInput = document.getElementById('alertSoundMode');
const alertSoundCountInput = document.getElementById('alertSoundCount');
const languageInput = document.getElementById('language');

function applyStrings(strings) {
    document.title = strings.windowTitle;
    document.getElementById('runAtStartupLabel').textContent = strings.runAtStartupLabel;
    document.getElementById('trayMonoIconLabel').textContent = strings.trayMonoIconLabel;
    document.getElementById('settingsForecastNotifyLabel').textContent = strings.settingsForecastNotifyLabel;
    document.getElementById('alertSoundLabel').textContent = strings.alertSoundLabel;
    document.getElementById('alertSoundModeNoneOption').textContent = strings.alertSoundModeNone;
    document.getElementById('alertSoundModeSirenOption').textContent = strings.alertSoundModeSiren;
    document.getElementById('alertSoundModeVoiceOption').textContent = strings.alertSoundModeVoice;
    document.getElementById('alertSoundCountLabel').textContent = strings.alertSoundCountLabel;
    document.getElementById('languageLabel').textContent = strings.languageLabel;
    document.getElementById('regionsHeader').textContent = strings.regionsHeader;
    searchInput.placeholder = strings.searchPlaceholder;
    return strings;
}

function formatSummary(template, selected, total) {
    return template.replace('{selected}', selected).replace('{total}', total);
}

async function initGeneralSettings(settings) {
    trayMonoIconInput.checked = settings.trayMonoIcon;
    forecastNotifyEnabledInput.checked = settings.forecastNotifyEnabled;
    alertSoundModeInput.value = settings.alertSoundMode;
    alertSoundCountInput.value = settings.alertSoundCount;
    languageInput.value = settings.language;
    runAtStartupInput.checked = await window.alertServer.getLoginItem();

    trayMonoIconInput.addEventListener('change', () => {
        window.alertServer.setSetting('trayMonoIcon', trayMonoIconInput.checked);
    });
    forecastNotifyEnabledInput.addEventListener('change', () => {
        window.alertServer.setSetting('forecastNotifyEnabled', forecastNotifyEnabledInput.checked);
    });
    alertSoundModeInput.addEventListener('change', () => {
        window.alertServer.setSetting('alertSoundMode', alertSoundModeInput.value);
    });
    alertSoundCountInput.addEventListener('change', () => {
        const count = Math.max(1, Math.min(10, Number(alertSoundCountInput.value) || 1));
        alertSoundCountInput.value = count;
        window.alertServer.setSetting('alertSoundCount', count);
    });
    languageInput.addEventListener('change', () => {
        window.alertServer.setSetting('language', languageInput.value);
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

    const regionTree = createRegionTree(treeContainer, tree, selectedUids, settings.language, async (uid, wasChecked) => {
        const isSelected = await window.alertServer.toggleRegion(uid);
        selectedCount += isSelected ? 1 : -1;
        updateSummary(selectedCount);
        return isSelected;
    });

    updateSummary(selectedCount);

    let searchTimer = null;
    searchInput.addEventListener('input', () => {
        clearTimeout(searchTimer);
        searchTimer = setTimeout(() => regionTree.setQuery(searchInput.value), 150);
    });
})();
