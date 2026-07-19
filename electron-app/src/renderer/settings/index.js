import { createRegionTree } from './components/RegionTree.js';

const treeContainer = document.getElementById('tree');
const searchInput = document.getElementById('search');
const summary = document.getElementById('summary');
const runAtStartupInput = document.getElementById('runAtStartup');
const trayMonoIconInput = document.getElementById('trayMonoIcon');
const alertSoundInput = document.getElementById('alertSound');
const languageInput = document.getElementById('language');

async function initGeneralSettings() {
    const settings = await window.alertServer.getSettings();
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

initGeneralSettings();

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
    const tree = await window.alertServer.getRegionTree();
    const selectedUids = await window.alertServer.getSelectedRegions();
    const total = totalRegionsCount(tree);

    function updateSummary(selectedCount) {
        summary.textContent = `Обрано регіонів: ${selectedCount} з ${total}. Зміни зберігаються автоматично.`;
    }

    let selectedCount = selectedUids.length;

    const regionTree = createRegionTree(treeContainer, tree, selectedUids, async (uid, wasChecked) => {
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
