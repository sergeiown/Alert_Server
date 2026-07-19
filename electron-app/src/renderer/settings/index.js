import { createRegionTree } from './components/RegionTree.js';

const treeContainer = document.getElementById('tree');
const searchInput = document.getElementById('search');
const summary = document.getElementById('summary');

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
