const REGION_TO_ISO = {
    4: ['UA-05'],
    8: ['UA-07'],
    9: ['UA-12'],
    28: ['UA-14'],
    10: ['UA-18'],
    11: ['UA-21'],
    12: ['UA-23'],
    13: ['UA-26'],
    14: ['UA-32'],
    15: ['UA-35'],
    16: ['UA-09'],
    27: ['UA-46'],
    31: ['UA-30'],
    17: ['UA-48'],
    18: ['UA-51'],
    19: ['UA-53'],
    5: ['UA-56'],
    20: ['UA-59'],
    21: ['UA-61'],
    22: ['UA-63'],
    23: ['UA-65'],
    3: ['UA-68'],
    24: ['UA-71'],
    26: ['UA-77'],
    25: ['UA-74'],
    29: ['UA-43', 'UA-40'],
};

function prepareSvgMarkup(svgText) {
    let markup = svgText.replace(/<style>[\s\S]*?<\/style>/, '');

    if (!/viewBox=/.test(markup)) {
        markup = markup.replace(
            /<svg([^>]*)width="([\d.]+)"([^>]*)height="([\d.]+)"([^>]*)>/,
            (full, before, width, between, height, after) =>
                `<svg${before}width="${width}"${between}height="${height}"${after} viewBox="0 0 ${width} ${height}">`
        );
    }

    return markup;
}

export function createUkraineMap(container, svgText, tree, initialSelectedUids, language, onToggle) {
    const isoToUid = new Map();
    Object.entries(REGION_TO_ISO).forEach(([uid, isoCodes]) => {
        isoCodes.forEach((iso) => isoToUid.set(iso, Number(uid)));
    });

    const nameByUid = new Map();
    tree.states.forEach((state) => nameByUid.set(state.uid, { name: state.stateName, lat: state.stateNameLat }));

    let currentLanguage = language;
    const selectedSet = new Set(initialSelectedUids);
    const pathsByUid = new Map();

    container.innerHTML = prepareSvgMarkup(svgText);
    const svg = container.querySelector('svg');

    function regionName(uid) {
        const info = nameByUid.get(uid);
        if (!info) return String(uid);
        return currentLanguage === 'English' ? info.lat : info.name;
    }

    function applyLabel(path, uid) {
        const title = path.querySelector('title');
        if (title) title.textContent = regionName(uid);
    }

    function applySelectedClass(path, isSelected) {
        path.classList.toggle('selected', isSelected);
    }

    function setSelected(uid, checked) {
        if (checked) selectedSet.add(uid);
        else selectedSet.delete(uid);

        const paths = pathsByUid.get(uid) || [];
        paths.forEach((path) => applySelectedClass(path, checked));
    }

    function setLanguage(newLanguage) {
        currentLanguage = newLanguage;
        pathsByUid.forEach((paths, uid) => paths.forEach((path) => applyLabel(path, uid)));
    }

    if (svg) {
        isoToUid.forEach((uid, iso) => {
            const path = svg.querySelector(`#${iso}`);
            if (!path) return;

            if (!pathsByUid.has(uid)) pathsByUid.set(uid, []);
            pathsByUid.get(uid).push(path);

            applyLabel(path, uid);
            applySelectedClass(path, selectedSet.has(uid));

            path.addEventListener('click', async () => {
                const isSelected = await onToggle(uid);
                setSelected(uid, isSelected);
            });
        });
    }

    return { setSelected, setLanguage };
}
