// Category names come straight from the Kaggle dataset (English, a fixed small set) - translated
// here for the Ukrainian UI since this screen otherwise reads like it forgot to localize, but
// intentionally NOT touching model names (Shahed-136/131, X-101/X-555, ...) - those are proper
// nouns/designations, not descriptive words, and stay as the source names them in either language.
const CATEGORY_UK = {
    UAV: 'БПЛА',
    'cruise missile': 'крилата ракета',
    'ballistic missile': 'балістична ракета',
    'surface-to-air missile': 'ракета ППО',
    'surface-to-air and ballistic': 'ППО/балістична',
    'guided bomb': 'керована авіабомба',
    unknown: 'невідомо',
};

const CATEGORY_COLOR = {
    UAV: '#f5a623',
    'cruise missile': '#991b1b',
    'ballistic missile': '#7c3aed',
    'surface-to-air missile': '#0d9488',
    'surface-to-air and ballistic': '#5b8fb0',
    'guided bomb': '#dc2626',
    unknown: '#6b7280',
};
const FALLBACK_COLOR = '#94a3b8';

function categoryName(category, isEnglish) {
    if (isEnglish) return category;
    return CATEGORY_UK[category] || category;
}

function categoryColor(category) {
    return CATEGORY_COLOR[category] || FALLBACK_COLOR;
}

function formatNumber(n) {
    return Math.round(n).toLocaleString();
}

function formatPercent(numerator, denominator) {
    if (!denominator) return '-';
    return `${Math.round((numerator / denominator) * 100)}%`;
}

function monthLabel(month, isEnglish) {
    const [year, m] = month.split('-');
    const date = new Date(Date.UTC(Number(year), Number(m) - 1, 1));
    return date.toLocaleDateString(isEnglish ? 'en-US' : 'uk-UA', { month: 'short', year: '2-digit', timeZone: 'UTC' });
}

function buildSummaryCard(stats, strings) {
    const card = document.createElement('section');
    card.className = 'card';
    const h2 = document.createElement('h2');
    h2.textContent = strings.trendsSummaryTitle;
    card.appendChild(h2);

    const row = document.createElement('div');
    row.id = 'summaryRow';

    const tiles = [
        { value: formatNumber(stats.totals.launched), label: strings.trendsLaunched },
        { value: formatNumber(stats.totals.destroyed), label: strings.trendsDestroyed },
        { value: formatPercent(stats.totals.destroyed, stats.totals.launched), label: strings.trendsInterceptionRate },
    ];
    tiles.forEach(({ value, label }) => {
        const tile = document.createElement('div');
        tile.className = 'stat-tile';
        tile.innerHTML = `<div class="value">${value}</div><div class="label">${label}</div>`;
        row.appendChild(tile);
    });

    card.appendChild(row);
    return card;
}

function buildCategoryCard(stats, strings, isEnglish) {
    const card = document.createElement('section');
    card.className = 'card';
    const h2 = document.createElement('h2');
    h2.textContent = strings.trendsByCategoryTitle;
    card.appendChild(h2);

    const table = document.createElement('table');
    table.innerHTML = `
        <thead><tr>
            <th>${strings.trendsCategory}</th>
            <th class="numeric">${strings.trendsLaunched}</th>
            <th class="numeric">${strings.trendsDestroyed}</th>
            <th class="numeric">${strings.trendsInterceptionRate}</th>
        </tr></thead>`;
    const tbody = document.createElement('tbody');
    stats.byCategory.forEach((entry) => {
        const tr = document.createElement('tr');
        tr.innerHTML = `
            <td><span class="swatch" style="background:${categoryColor(entry.category)}"></span>${categoryName(entry.category, isEnglish)}</td>
            <td class="numeric">${formatNumber(entry.launched)}</td>
            <td class="numeric">${formatNumber(entry.destroyed)}</td>
            <td class="numeric">${formatPercent(entry.destroyed, entry.launched)}</td>`;
        tbody.appendChild(tr);
    });
    table.appendChild(tbody);
    card.appendChild(table);
    return card;
}

// Hand-rolled stacked bar chart (no charting library) - one bar per month, one colored segment per
// category, proportional to that category's launched count that month.
function buildMonthlyChart(stats, strings, isEnglish) {
    const card = document.createElement('section');
    card.className = 'card';
    const h2 = document.createElement('h2');
    h2.textContent = strings.trendsMonthlyTitle;
    card.appendChild(h2);

    const months = stats.monthly;
    const categories = stats.byCategory.map((c) => c.category);
    const maxLaunched = Math.max(1, ...months.map((m) => m.launched));

    const barWidth = 14;
    const gap = 4;
    const chartHeight = 200;
    const width = months.length * (barWidth + gap) + gap;
    const height = chartHeight + 24; // room for month labels

    const svgParts = [];
    months.forEach((entry, index) => {
        const x = gap + index * (barWidth + gap);
        let yCursor = chartHeight;
        categories.forEach((category) => {
            const value = entry.categories[category] || 0;
            if (!value) return;
            const barHeight = (value / maxLaunched) * chartHeight;
            yCursor -= barHeight;
            svgParts.push(
                `<rect x="${x}" y="${yCursor.toFixed(1)}" width="${barWidth}" height="${barHeight.toFixed(1)}" fill="${categoryColor(category)}"><title>${monthLabel(entry.month, isEnglish)}: ${categoryName(category, isEnglish)} - ${formatNumber(value)}</title></rect>`
            );
        });
        // Every 6th month gets a label - showing all ~48 would just overlap illegibly.
        if (index % 6 === 0) {
            svgParts.push(
                `<text x="${x + barWidth / 2}" y="${chartHeight + 16}" font-size="9" text-anchor="middle" fill="currentColor" opacity="0.7">${monthLabel(entry.month, isEnglish)}</text>`
            );
        }
    });

    const wrapper = document.createElement('div');
    wrapper.className = 'chart-scroll';
    wrapper.innerHTML = `<svg viewBox="0 0 ${width} ${height}" width="${width}" height="${height}" style="color:var(--fg)">${svgParts.join('')}</svg>`;
    card.appendChild(wrapper);

    const legend = document.createElement('div');
    legend.className = 'chart-legend';
    categories.forEach((category) => {
        const item = document.createElement('span');
        item.innerHTML = `<span class="swatch" style="background:${categoryColor(category)}"></span>${categoryName(category, isEnglish)}`;
        legend.appendChild(item);
    });
    card.appendChild(legend);

    return card;
}

function buildModelsCard(stats, strings, isEnglish) {
    const card = document.createElement('section');
    card.className = 'card';
    const h2 = document.createElement('h2');
    h2.textContent = strings.trendsTopModelsTitle;
    card.appendChild(h2);

    const table = document.createElement('table');
    table.innerHTML = `
        <thead><tr>
            <th>${strings.trendsModel}</th>
            <th>${strings.trendsCategory}</th>
            <th class="numeric">${strings.trendsLaunched}</th>
            <th class="numeric">${strings.trendsDestroyed}</th>
            <th class="numeric">${strings.trendsInterceptionRate}</th>
        </tr></thead>`;
    const tbody = document.createElement('tbody');
    stats.byModel.forEach((entry) => {
        const tr = document.createElement('tr');
        tr.innerHTML = `
            <td>${entry.model}</td>
            <td>${categoryName(entry.category, isEnglish)}</td>
            <td class="numeric">${formatNumber(entry.launched)}</td>
            <td class="numeric">${formatNumber(entry.destroyed)}</td>
            <td class="numeric">${formatPercent(entry.destroyed, entry.launched)}</td>`;
        tbody.appendChild(tr);
    });
    table.appendChild(tbody);
    card.appendChild(table);
    return card;
}

async function main() {
    const strings = await window.alertServerTrends.getStrings();
    const settings = await window.alertServerTrends.getSettings();
    const isEnglish = settings.language === 'English';

    document.title = strings.trendsWindowTitle;
    document.getElementById('trendsHeader').textContent = strings.trendsHeader;

    const content = document.getElementById('content');
    const stats = await window.alertServerTrends.getWeaponStats();

    if (!stats) {
        content.innerHTML = '';
        const p = document.createElement('p');
        p.id = 'errorText';
        p.textContent = strings.trendsNoData;
        content.appendChild(p);
        return;
    }

    const rangeText = strings.trendsRangeLabel
        .replace('{from}', stats.dateRange.from)
        .replace('{to}', stats.dateRange.to);
    document.getElementById('trendsRange').textContent = rangeText;

    content.innerHTML = '';
    content.appendChild(buildSummaryCard(stats, strings));
    content.appendChild(buildMonthlyChart(stats, strings, isEnglish));
    content.appendChild(buildCategoryCard(stats, strings, isEnglish));
    content.appendChild(buildModelsCard(stats, strings, isEnglish));
}

main();
