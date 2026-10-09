// Copyright (c) 2024-2026 Serhii I. Myshko
// Licensed under the MIT License. See LICENSE for details.

function nodeName(node, type, language) {
    const useLatin = language === 'English';
    if (type === 'state') return useLatin ? node.stateNameLat : node.stateName;
    if (type === 'district') return useLatin ? node.districtNameLat : node.districtName;
    return useLatin ? node.communityNameLat : node.communityName;
}

function nodeChildren(node, type) {
    if (type === 'state') return node.districts || [];
    if (type === 'district') return node.communities || [];
    return [];
}

function childType(type) {
    if (type === 'state') return 'district';
    if (type === 'district') return 'community';
    return null;
}

function matchesQuery(node, type, query, language) {
    if (!query) return true;
    if (nodeName(node, type, language).toLowerCase().includes(query)) return true;
    return nodeChildren(node, type).some((child) => matchesQuery(child, childType(type), query, language));
}

function countSelected(node, type, selectedSet, covered = false) {
    if (covered || selectedSet.has(node.uid)) return countTotal(node, type);
    let count = 0;
    nodeChildren(node, type).forEach((child) => {
        count += countSelected(child, childType(type), selectedSet);
    });
    return count;
}

function countTotal(node, type) {
    let count = 1;
    nodeChildren(node, type).forEach((child) => {
        count += countTotal(child, childType(type));
    });
    return count;
}

export function createRegionTree(container, tree, initialSelectedUids, language, onToggle) {
    const selectedSet = new Set(initialSelectedUids);
    const wrapperByUid = new Map();
    const nodeByUid = new Map();
    const typeByUid = new Map();
    const parentByUid = new Map();

    function isCovered(uid) {
        const seen = new Set([uid]);
        let parent = parentByUid.get(uid);
        while (parent !== undefined && !seen.has(parent)) {
            if (selectedSet.has(parent)) return true;
            seen.add(parent);
            parent = parentByUid.get(parent);
        }
        return false;
    }

    function buildNodeElement(node, type, query, parentUid) {
        const wrapper = document.createElement('div');
        wrapper.className = type === 'state' ? 'state-node' : 'node';
        wrapper.dataset.uid = String(node.uid);

        nodeByUid.set(node.uid, node);
        typeByUid.set(node.uid, type);
        wrapperByUid.set(node.uid, wrapper);
        if (parentUid !== undefined && parentUid !== node.uid) parentByUid.set(node.uid, parentUid);

        const children = nodeChildren(node, type);
        const hasChildren = children.length > 0;

        const row = document.createElement('div');
        row.className = 'node-row';

        const arrow = document.createElement('span');
        arrow.className = 'toggle-arrow' + (hasChildren ? '' : ' leaf');
        arrow.textContent = hasChildren ? (query ? '▾' : '▸') : '';
        row.appendChild(arrow);

        const checkbox = document.createElement('input');
        checkbox.type = 'checkbox';
        const covered = isCovered(node.uid);
        checkbox.checked = selectedSet.has(node.uid) || covered;
        checkbox.disabled = covered;
        checkbox.addEventListener('change', () => handleToggle(node.uid, checkbox));
        row.appendChild(checkbox);

        const label = document.createElement('span');
        label.textContent = nodeName(node, type, language);
        row.appendChild(label);

        if (hasChildren) {
            const count = document.createElement('span');
            count.className = 'node-count';
            count.textContent = `[${countSelected(node, type, selectedSet, covered)}/${countTotal(node, type)}]`;
            row.appendChild(count);
        }

        wrapper.appendChild(row);

        const childrenContainer = document.createElement('div');
        childrenContainer.className = 'children' + (query ? '' : ' collapsed');

        if (hasChildren) {
            arrow.addEventListener('click', () => {
                childrenContainer.classList.toggle('collapsed');
                arrow.textContent = childrenContainer.classList.contains('collapsed') ? '▸' : '▾';
            });

            children.forEach((child) => {
                const ct = childType(type);
                if (matchesQuery(child, ct, query, language)) {
                    childrenContainer.appendChild(buildNodeElement(child, ct, query, node.uid));
                }
            });
        }

        wrapper.appendChild(childrenContainer);

        if (!matchesQuery(node, type, query, language)) {
            wrapper.classList.add('hidden');
        }

        return wrapper;
    }

    function refreshStates() {
        wrapperByUid.forEach((wrapper, uid) => {
            const covered = isCovered(uid);
            const checkbox = wrapper.querySelector(':scope > .node-row > input[type="checkbox"]');
            if (checkbox) {
                checkbox.checked = selectedSet.has(uid) || covered;
                checkbox.disabled = covered;
            }
            const countSpan = wrapper.querySelector(':scope > .node-row > .node-count');
            const node = nodeByUid.get(uid);
            if (countSpan && node) {
                const type = typeByUid.get(uid);
                countSpan.textContent = `[${countSelected(node, type, selectedSet, covered)}/${countTotal(node, type)}]`;
            }
        });
    }

    function handleToggle(uid, checkbox) {
        onToggle(uid, checkbox.checked).then((confirmedSelected) => {
            checkbox.checked = confirmedSelected;
            if (confirmedSelected) selectedSet.add(uid);
            else selectedSet.delete(uid);
            refreshStates();
        });
    }

    function setUidChecked(uid, checked) {
        const wrapper = wrapperByUid.get(uid);
        if (!wrapper) return;

        const checkbox = wrapper.querySelector(':scope > .node-row > input[type="checkbox"]');
        if (checkbox) checkbox.checked = checked;

        if (checked) selectedSet.add(uid);
        else selectedSet.delete(uid);
        refreshStates();
    }

    function redrawWithQuery(query) {
        wrapperByUid.clear();
        nodeByUid.clear();
        typeByUid.clear();
        container.innerHTML = '';
        const normalizedQuery = (query || '').trim().toLowerCase();
        tree.states.forEach((state) => {
            container.appendChild(buildNodeElement(state, 'state', normalizedQuery, undefined));
        });
    }

    redrawWithQuery('');

    return { setQuery: redrawWithQuery, getSelectedCount: () => selectedSet.size, setUidChecked };
}
