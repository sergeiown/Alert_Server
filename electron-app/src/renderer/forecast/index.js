const list = document.getElementById('regionsList');

let strings = null;
let renderToken = 0;

function addCopyButton(card, pre, strings) {
    const button = document.createElement('button');
    button.className = 'copy-button';
    button.textContent = strings.forecastCopyButton;
    button.addEventListener('click', async () => {
        await window.alertServerForecast.copyToClipboard(pre.textContent);
        const original = button.textContent;
        button.textContent = strings.forecastCopied;
        setTimeout(() => {
            button.textContent = original;
        }, 1500);
    });
    card.appendChild(button);
}

async function renderLocalStats(strings) {
    const stats = await window.alertServerForecast.getLocalStats();
    const line = strings.forecastLocalStatsLabel
        .replace('{days}', stats.spanDays)
        .replace('{regions}', stats.regionCount)
        .replace('{total}', stats.totalAlerts);
    document.getElementById('localStatsLine').textContent = line;
    document.getElementById('localStatsNote').textContent = strings.forecastLocalStatsNote;
}

function sortRank({ result }) {
    if (result.status === 'active') return 0;
    if (result.status === 'ok' && typeof result.etaMs === 'number') return 1 + result.etaMs;
    return Infinity;
}

async function renderRegionsList() {
    const token = ++renderToken;
    list.innerHTML = '';

    const regions = await window.alertServerForecast.getRegions();
    if (token !== renderToken) return;

    if (!regions.length) {
        const p = document.createElement('p');
        p.textContent = strings.forecastNoRegions;
        list.appendChild(p);
        return;
    }

    const loading = document.createElement('p');
    loading.textContent = strings.forecastLoading;
    list.appendChild(loading);

    const entries = await Promise.all(
        regions.map(async (region) => {
            try {
                return { region, result: await window.alertServerForecast.getRegionForecast(region.uid) };
            } catch (err) {
                return { region, result: { status: 'empty' } };
            }
        })
    );
    if (token !== renderToken) return;

    entries.sort((a, b) => sortRank(a) - sortRank(b));

    list.removeChild(loading);

    entries.forEach(({ region, result }) => {
        const card = document.createElement('div');

        const h2 = document.createElement('h2');
        h2.textContent = region.name;
        card.appendChild(h2);

        const pre = document.createElement('pre');
        card.appendChild(pre);

        if (result.status === 'active') {
            card.className = 'region-card active';
            pre.textContent = strings.forecastActiveAlert;
        } else if (result.status === 'ok') {
            card.className = 'region-card';
            pre.textContent = result.text;
            addCopyButton(card, pre, strings);
        } else {
            card.className = 'region-card empty';
            pre.textContent = strings.forecastNoHistory;
        }

        list.appendChild(card);
    });
}

async function main() {
    strings = await window.alertServerForecast.getStrings();
    document.title = strings.forecastWindowTitle;
    document.getElementById('forecastHeader').textContent = strings.forecastHeader;

    const clearStatsButton = document.getElementById('clearStatsButton');
    clearStatsButton.textContent = strings.forecastClearStatsButton;
    clearStatsButton.addEventListener('click', async () => {
        const { cleared } = await window.alertServerForecast.clearLocalStats();
        if (cleared) await renderLocalStats(strings);
    });
    await renderLocalStats(strings);

    await renderRegionsList();

    window.alertServerForecast.onRegionsChanged(() => {
        renderRegionsList();
    });
}

main();
