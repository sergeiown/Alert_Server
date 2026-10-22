// Copyright (c) 2024-2026 Serhii I. Myshko
// Licensed under the MIT License. See LICENSE for details.

const STYLE_ID = 'connectionBannerStyle';

function ensureStyles() {
    if (document.getElementById(STYLE_ID)) return;
    const link = document.createElement('link');
    link.id = STYLE_ID;
    link.rel = 'stylesheet';
    link.href = new URL('./connectionBanner.css', import.meta.url).href;
    document.head.appendChild(link);
}

function bannerText(state, strings) {
    if (state.reason === 'offline') return strings.connectionOfflineBanner;
    if (state.reason === 'link') return strings.connectionLinkBanner;
    return strings.connectionNoDataBanner;
}

export function initConnectionBanner({ api, strings, mode = 'fixed', mount = null }) {
    ensureStyles();

    const banner = document.createElement('div');
    banner.id = 'connectionBanner';
    banner.className = `connection-banner connection-banner--${mode}`;
    banner.setAttribute('role', 'status');
    banner.setAttribute('aria-live', 'polite');
    banner.hidden = true;

    if (mount) mount.prepend(banner);
    else document.body.prepend(banner);

    const root = document.documentElement;

    function syncHeight() {
        if (mode !== 'fixed') return;
        root.style.setProperty('--connection-banner-height', banner.hidden ? '0px' : `${banner.offsetHeight}px`);
    }

    function apply(state) {
        const visible = Boolean(state && state.offline);
        banner.hidden = !visible;
        if (visible) banner.textContent = bannerText(state, strings);
        if (mode === 'fixed') root.classList.toggle('connection-offline', visible);
        syncHeight();
    }

    if (mode === 'fixed' && typeof ResizeObserver === 'function') new ResizeObserver(syncHeight).observe(banner);

    api.onConnectionChange(apply);
    if (typeof api.reportOnline === 'function') {
        window.addEventListener('online', () => api.reportOnline(true));
        window.addEventListener('offline', () => api.reportOnline(false));
    }

    api.getConnectionState().then(apply);
    return { apply };
}
