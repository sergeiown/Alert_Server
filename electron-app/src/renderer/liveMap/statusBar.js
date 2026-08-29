// Copyright (c) 2024-2026 Serhii I. Myshko
// Licensed under the MIT License. See LICENSE for details.

const CLOCK_TICK_MS = 1000;
const ALERT_COUNT_REFRESH_MS = 30000;

function formatClock(now, language) {
    const locale = language === 'English' ? 'en-US' : 'uk-UA';
    const datePart = now.toLocaleDateString(locale, { day: 'numeric', month: 'long', year: 'numeric' });
    const timePart = now.toLocaleTimeString(locale, { hour: '2-digit', minute: '2-digit', second: '2-digit' });
    return `${datePart} · ${timePart}`;
}

function startStatusBar(strings, language) {
    const clockEl = document.getElementById('statusClock');
    const countEl = document.getElementById('statusAlertCount');

    // Alert count and threat count come from two independent sources on two independent
    // schedules (a periodic IPC poll here, a push from the Neptun layer whenever it re-renders)
    // - both are kept so either one updating alone still redraws the combined line correctly.
    let alertCount = 0;
    let threatCount = 0;

    function tickClock() {
        clockEl.textContent = formatClock(new Date(), language);
    }

    function renderCounts() {
        countEl.textContent = strings.liveMapStatusCounts
            .replace('{alerts}', alertCount)
            .replace('{threats}', threatCount);
    }

    async function refreshAlertCount() {
        alertCount = await window.alertServerLiveMap.getActiveAlertCount();
        renderCounts();
    }

    function setThreatCount(count) {
        threatCount = count;
        renderCounts();
    }

    tickClock();
    setInterval(tickClock, CLOCK_TICK_MS);

    refreshAlertCount();
    setInterval(refreshAlertCount, ALERT_COUNT_REFRESH_MS);

    return { setThreatCount };
}

export { startStatusBar };
