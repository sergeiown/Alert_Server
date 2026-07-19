import { createRegionTree } from './components/RegionTree.js';

const treeContainer = document.getElementById('tree');
const searchInput = document.getElementById('search');
const summary = document.getElementById('summary');
const runAtStartupInput = document.getElementById('runAtStartup');
const trayMonoIconInput = document.getElementById('trayMonoIcon');
const alertSoundInput = document.getElementById('alertSound');
const languageInput = document.getElementById('language');

function applyStrings(strings) {
    document.title = strings.windowTitle;
    document.getElementById('runAtStartupLabel').textContent = strings.runAtStartupLabel;
    document.getElementById('trayMonoIconLabel').textContent = strings.trayMonoIconLabel;
    document.getElementById('alertSoundLabel').textContent = strings.alertSoundLabel;
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
    alertSoundInput.checked = settings.alertSound;
    languageInput.value = settings.language;
    runAtStartupInput.checked = await window.alertServer.getLoginItem();

    trayMonoIconInput.addEventListener('change', () => {
        window.alertServer.setSetting('trayMonoIcon', trayMonoIconInput.checked);
    });
    alertSoundInput.addEventListener('change', () => {
        window.alertServer.setSetting('alertSound', alertSoundInput.checked);
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
