// Copyright (c) 2024-2026 Serhii I. Myshko
// Licensed under the MIT License. See LICENSE for details.

(function () {
    'use strict';

    const web = window.alertMapWeb;
    const isEnglish = web.language === 'English';

    const text = isEnglish
        ? {
              notice: 'Unofficial source: data may be delayed or incomplete. Always follow the official air-raid sirens.',
              about: 'About',
              statusLive: 'Live',
              statusPolling: 'Updating',
              statusStale: 'Data is stale',
              statusTitle: 'Connection status',
              title: 'About this map',
              warningTitle: 'Important',
              warning:
                  'This is an unofficial, informational map. It is not an official alert system and must not be your only source or used for critical decisions. Updates can be delayed and data can contain errors. When the official siren sounds, go to a shelter.',
              dataTitle: 'Data',
              alertsLine: 'Alerts:',
              alertsNote: 'polled from the public API and pushed to this page as soon as they change.',
              neptunLine: 'Threat data:',
              neptunNote: 'Data: Air alert map',
              frontLine: 'Front line:',
              mapTitle: 'Map',
              mapText:
                  'Oblast and raion boundaries come from slawomirmatuszak/ukrainian_geodata (CC BY 4.0), the river outline from Natural Earth (public domain), the map engine is Leaflet (BSD-2-Clause).',
              privacyTitle: 'Privacy',
              privacyText:
                  'No cookies and no trackers. Your language, theme and layer choices are kept only in your browser. IP addresses are not written to logs or a database; they are held briefly in memory only to limit abusive request rates. Only anonymous per-page counters are kept.',
              openSourceTitle: 'Open source',
              openSourceText: 'The code of this map and its server is open:',
              close: 'Close',
          }
        : {
              notice: 'Неофіційне джерело: дані можуть запізнюватись або бути неповними. Завжди дотримуйтесь офіційних сигналів тривоги.',
              about: 'Про сервіс',
              statusLive: 'Наживо',
              statusPolling: 'Оновлення',
              statusStale: 'Дані застаріли',
              statusTitle: 'Стан з’єднання',
              title: 'Про цю мапу',
              warningTitle: 'Важливо',
              warning:
                  'Це неофіційна інформаційна мапа. Вона не є офіційною системою оповіщення, не має бути вашим єдиним джерелом і не призначена для критичних рішень. Оновлення можуть запізнюватись, а дані містити помилки. Коли лунає офіційна сирена, прямуйте в укриття.',
              dataTitle: 'Дані',
              alertsLine: 'Тривоги:',
              alertsNote: 'опитуються з публічного API і надсилаються на цю сторінку одразу, щойно змінюються.',
              neptunLine: 'Дані про загрози:',
              neptunNote: 'Дані: Карта повітряних тривог',
              frontLine: 'Лінія фронту:',
              mapTitle: 'Мапа',
              mapText:
                  'Кордони областей і районів - з slawomirmatuszak/ukrainian_geodata (CC BY 4.0), контур річки - з Natural Earth (суспільне надбання), рушій мапи - Leaflet (BSD-2-Clause).',
              privacyTitle: 'Приватність',
              privacyText:
                  'Без cookies і трекерів. Вибір мови, теми та шарів зберігається лише у вашому браузері. IP-адреси не записуються в журнали чи базу даних; вони короткочасно лишаються в пам’яті лише для обмеження надмірної частоти запитів. Зберігаються тільки знеособлені лічильники за сторінками.',
              openSourceTitle: 'Відкритий код',
              openSourceText: 'Код цієї мапи та її сервера відкритий:',
              close: 'Закрити',
          };

    function el(tag, attrs, children) {
        const node = document.createElement(tag);
        Object.keys(attrs || {}).forEach((key) => {
            if (key === 'text') node.textContent = attrs[key];
            else node.setAttribute(key, attrs[key]);
        });
        (children || []).forEach((child) => {
            node.appendChild(typeof child === 'string' ? document.createTextNode(child) : child);
        });
        return node;
    }

    function link(href, label) {
        return el('a', { href, target: '_blank', rel: 'noopener noreferrer', text: label });
    }

    document.getElementById('webNotice').textContent = text.notice;

    const root = document.documentElement;
    if (!(root.requestFullscreen || root.webkitRequestFullscreen)) root.classList.add('no-fullscreen');

    const fullscreenProto = L.Control.FullScreenButton && L.Control.FullScreenButton.prototype;
    if (fullscreenProto) {
        const enterOrExit = fullscreenProto._toggleFullScreenElement;
        fullscreenProto._toggleFullScreenElement = function (element, enter) {
            return enterOrExit.call(this, document.documentElement, enter);
        };
    }

    const darkQuery = web.nativeMatchMedia('(prefers-color-scheme: dark)');
    if (web.theme === 'auto' && typeof darkQuery.addEventListener === 'function') {
        darkQuery.addEventListener('change', () => {
            location.reload();
        });
    }

    const bar = document.getElementById('webBar');
    function syncBarHeight() {
        document.documentElement.style.setProperty('--web-bar-height', `${bar.offsetHeight}px`);
    }
    syncBarHeight();
    if (typeof ResizeObserver === 'function') new ResizeObserver(syncBarHeight).observe(bar);

    const SETTINGS_KEY = 'alertmap.settings';
    function loadSettings() {
        try {
            return JSON.parse(localStorage.getItem(SETTINGS_KEY)) || {};
        } catch (err) {
            return {};
        }
    }
    function saveSettings(settings) {
        try {
            localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
        } catch (err) {}
    }

    web.whenMapReady((api) => {
        const credits = api.map.attributionControl && api.map.attributionControl.getContainer();
        if (credits) document.getElementById('webCredits').appendChild(credits);

        const settings = loadSettings();
        const saved = settings.layers || {};
        const narrow = window.matchMedia('(max-width: 560px)').matches;

        if (api.map.hasLayer(api.layers.hints)) api.map.removeLayer(api.layers.hints);
        api.layersControl.removeLayer(api.layers.hints);
        delete api.layers.hints;

        Object.keys(api.layers).forEach((name) => {
            const wanted = name in saved ? saved[name] : !(narrow && (name === 'legend' || name === 'hints'));
            if (!wanted && api.map.hasLayer(api.layers[name])) api.map.removeLayer(api.layers[name]);
        });

        api.map.on('overlayadd overlayremove', (event) => {
            const classes = api.map.getContainer().classList;
            if (classes.contains('kyiv-mode-active') || classes.contains('map-transitioning')) return;

            const name = Object.keys(api.layers).find((key) => {
                return api.layers[key] === event.layer;
            });
            if (!name) return;

            const current = loadSettings();
            current.layers = current.layers || {};
            current.layers[name] = event.type === 'overlayadd';
            saveSettings(current);
        });
    });

    const languageBox = document.getElementById('webLanguage');
    [
        ['Ukrainian', 'UA'],
        ['English', 'EN'],
    ].forEach((entry) => {
        const button = el('button', { type: 'button', text: entry[1], 'aria-pressed': String(web.language === entry[0]) });
        button.addEventListener('click', () => {
            if (web.language !== entry[0]) web.setLanguage(entry[0]);
        });
        languageBox.appendChild(button);
    });

    const THEME_ORDER = ['auto', 'light', 'dark'];
    const THEME_ICON = { auto: '\u25D0', light: '\u2600', dark: '\u263E' };
    const themeLabels = isEnglish
        ? { auto: 'Theme: automatic', light: 'Theme: light', dark: 'Theme: dark' }
        : { auto: 'Тема: автоматична', light: 'Тема: світла', dark: 'Тема: темна' };
    const themeButton = document.getElementById('webTheme');
    themeButton.textContent = THEME_ICON[web.theme];
    themeButton.title = themeLabels[web.theme];
    themeButton.setAttribute('aria-label', themeLabels[web.theme]);
    themeButton.addEventListener('click', () => {
        web.setTheme(THEME_ORDER[(THEME_ORDER.indexOf(web.theme) + 1) % THEME_ORDER.length]);
    });

    const statusButton = document.getElementById('webStatus');
    statusButton.title = text.statusTitle;
    web.onStatus((status) => {
        const mode = status.stale ? 'stale' : status.live ? 'live' : 'polling';
        statusButton.className = `web-chip${mode === 'stale' ? ' stale' : ''}`;
        statusButton.replaceChildren(
            el('span', { class: 'dot' }),
            el('span', { class: 'label', text: mode === 'stale' ? text.statusStale : mode === 'live' ? text.statusLive : text.statusPolling })
        );
    });

    const aboutButton = document.getElementById('webAbout');
    aboutButton.textContent = text.about;

    const dialog = document.getElementById('aboutDialog');
    document.getElementById('aboutClose').setAttribute('aria-label', text.close);

    function buildAbout() {
        const features = web.getFeatures();
        const dataList = el('ul', {}, [
            el('li', {}, [`${text.alertsLine} `, link('https://alerts.in.ua/', 'alerts.in.ua'), ` - ${text.alertsNote}`]),
        ]);

        if (features.threats) {
            dataList.appendChild(el('li', {}, [`${text.neptunLine} `, link('https://neptun.in.ua/', 'NEPTUN'), ` (${text.neptunNote} - NEPTUN)`]));
        }
        if (features.occupied) {
            dataList.appendChild(el('li', {}, [`${text.frontLine} `, link('https://deepstatemap.live/', 'DeepStateMap.live')]));
        }

        const body = document.getElementById('aboutBody');
        body.replaceChildren(
            el('h2', { id: 'aboutTitle', text: text.title }),
            el('div', { class: 'about-warning' }, [el('strong', { text: `${text.warningTitle}. ` }), text.warning]),
            el('h3', { text: text.dataTitle }),
            dataList,
            el('h3', { text: text.mapTitle }),
            el('p', { text: text.mapText }),
            el('h3', { text: text.privacyTitle }),
            el('p', { text: text.privacyText }),
            el('h3', { text: text.openSourceTitle }),
            el('p', {}, [`${text.openSourceText} `, link('https://github.com/sergeiown/Alert_Server', 'github.com/sergeiown/Alert_Server')])
        );
    }

    aboutButton.addEventListener('click', () => {
        buildAbout();
        if (typeof dialog.showModal === 'function') dialog.showModal();
    });

    dialog.addEventListener('click', (event) => {
        if (event.target === dialog) dialog.close();
    });
})();
