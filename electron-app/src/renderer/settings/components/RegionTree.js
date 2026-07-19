function nodeName(node, type) {
    if (type === 'state') return node.stateName;
    if (type === 'district') return node.districtName;
    return node.communityName;
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

function matchesQuery(node, type, query) {
    if (!query) return true;
    if (nodeName(node, type).toLowerCase().includes(query)) return true;
    return nodeChildren(node, type).some((child) => matchesQuery(child, childType(type), query));
}

function countSelected(node, type, selectedSet) {
    let count = selectedSet.has(node.uid) ? 1 : 0;
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

export function createRegionTree(container, tree, initialSelectedUids, onToggle) {
    const selectedSet = new Set(initialSelectedUids);
    const wrapperByUid = new Map();
    const nodeByUid = new Map();
    const typeByUid = new Map();

    function buildNodeElement(node, type, query) {
        const wrapper = document.createElement('div');
        wrapper.className = type === 'state' ? 'state-node' : 'node';
        wrapper.dataset.uid = String(node.uid);

        nodeByUid.set(node.uid, node);
        typeByUid.set(node.uid, type);
        wrapperByUid.set(node.uid, wrapper);

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
        checkbox.checked = selectedSet.has(node.uid);
        checkbox.addEventListener('change', () => handleToggle(node.uid, checkbox));
        row.appendChild(checkbox);

        const label = document.createElement('span');
        label.textContent = nodeName(node, type);
        row.appendChild(label);

        if (hasChildren) {
            const count = document.createElement('span');
            count.className = 'node-count';
            count.textContent = `[${countSelected(node, type, selectedSet)}/${countTotal(node, type)}]`;
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
                if (matchesQuery(child, ct, query)) {
                    childrenContainer.appendChild(buildNodeElement(child, ct, query));
                }
            });
        }

        wrapper.appendChild(childrenContainer);

        if (!matchesQuery(node, type, query)) {
            wrapper.classList.add('hidden');
        }

        return wrapper;
    }

    function updateAncestorCounts(uid) {
        let wrapper = wrapperByUid.get(uid);
        while (wrapper) {
            const parentChildren = wrapper.parentElement;
            const ancestorWrapper = parentChildren && parentChildren.closest('.node, .state-node');
            if (!ancestorWrapper) break;

            const ancestorUid = Number(ancestorWrapper.dataset.uid);
            const ancestorNode = nodeByUid.get(ancestorUid);
            const ancestorType = typeByUid.get(ancestorUid);
            const countSpan = ancestorWrapper.querySelector(':scope > .node-row > .node-count');
            if (countSpan && ancestorNode) {
                countSpan.textContent = `[${countSelected(ancestorNode, ancestorType, selectedSet)}/${countTotal(ancestorNode, ancestorType)}]`;
            }

            wrapper = ancestorWrapper;
        }
    }

    function handleToggle(uid, checkbox) {
        onToggle(uid, checkbox.checked).then((confirmedSelected) => {
            checkbox.checked = confirmedSelected;
            if (confirmedSelected) selectedSet.add(uid);
            else selectedSet.delete(uid);
            updateAncestorCounts(uid);
        });
    }

    function redrawWithQuery(query) {
        wrapperByUid.clear();
        nodeByUid.clear();
        typeByUid.clear();
        container.innerHTML = '';
        const normalizedQuery = (query || '').trim().toLowerCase();
        tree.states.forEach((state) => {
            container.appendChild(buildNodeElement(state, 'state', normalizedQuery));
        });
    }

    redrawWithQuery('');

    return { setQuery: redrawWithQuery, getSelectedCount: () => selectedSet.size };
}
