const list = document.getElementById('regionsList');

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

async function main() {
    const strings = await window.alertServerForecast.getStrings();
    document.title = strings.forecastWindowTitle;
    document.getElementById('forecastHeader').textContent = strings.forecastHeader;

    const regions = await window.alertServerForecast.getRegions();

    if (!regions.length) {
        const p = document.createElement('p');
        p.textContent = strings.forecastNoRegions;
        list.appendChild(p);
        return;
    }

    const cards = new Map();
    regions.forEach((region) => {
        const card = document.createElement('div');
        card.className = 'region-card loading';

        const h2 = document.createElement('h2');
        h2.textContent = region.name;
        card.appendChild(h2);

        const pre = document.createElement('pre');
        pre.textContent = strings.forecastLoading;
        card.appendChild(pre);

        list.appendChild(card);
        cards.set(region.uid, { card, pre });
    });

    for (const region of regions) {
        const { card, pre } = cards.get(region.uid);
        try {
            const result = await window.alertServerForecast.getRegionForecast(region.uid);
            if (result.status === 'active') {
                card.className = 'region-card active';
                pre.textContent = strings.forecastActiveAlert;
            } else if (result.status === 'empty') {
                card.className = 'region-card empty';
                pre.textContent = strings.forecastNoHistory;
            } else {
                card.className = 'region-card';
                pre.textContent = result.text;
                addCopyButton(card, pre, strings);
            }
        } catch (err) {
            card.className = 'region-card empty';
            pre.textContent = strings.forecastNoHistory;
        }
    }
}

main();
