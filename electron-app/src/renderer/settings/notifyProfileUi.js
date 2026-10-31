// Copyright (c) 2024-2026 Serhii I. Myshko
// Licensed under the MIT License. See LICENSE for details.

const ROWS = ['startRed', 'startYellow', 'escalateRed', 'digest', 'end', 'levelChange', 'forecast'];
const SECONDS_OPTIONS = [7, 10, 15, 20, 25, 30, 60, 120, 300, 900];

function formatSeconds(strings, seconds) {
    if (seconds >= 60) return strings.notifyMinutesShort.replace('{n}', seconds / 60);
    return strings.notifySecondsShort.replace('{n}', seconds);
}

function createTimeSelect(strings, current, onChange) {
    const select = document.createElement('select');
    select.className = 'ui-select';
    SECONDS_OPTIONS.forEach((seconds) => {
        const option = document.createElement('option');
        option.value = String(seconds);
        option.textContent = formatSeconds(strings, seconds);
        select.appendChild(option);
    });
    select.value = String(current);
    select.addEventListener('change', () => onChange(Number(select.value)));
    return select;
}

function createKindToggle(strings, emergency, onChange) {
    const wrap = document.createElement('div');
    wrap.className = 'kind-toggle';
    wrap.setAttribute('role', 'group');
    const buttons = [
        { value: 'emergency', label: strings.notifyKindEmergency },
        { value: 'standard', label: strings.notifyKindStandard },
    ].map(({ value, label }) => {
        const button = document.createElement('button');
        button.type = 'button';
        button.dataset.kind = value;
        button.textContent = label;
        wrap.appendChild(button);
        return button;
    });

    const paint = (isEmergency) => {
        buttons.forEach((button) => {
            const on = (button.dataset.kind === 'emergency') === isEmergency;
            button.classList.toggle('on', on);
            button.setAttribute('aria-pressed', String(on));
        });
    };
    paint(emergency);

    buttons.forEach((button) =>
        button.addEventListener('click', () => {
            const isEmergency = button.dataset.kind === 'emergency';
            paint(isEmergency);
            onChange(isEmergency);
        })
    );
    return { element: wrap, buttons };
}

async function refreshUrgentStatus(strings) {
    const label = document.getElementById('urgentStatusLabel');
    const pill = document.getElementById('urgentStatusPill');
    const button = document.getElementById('openWindowsNotifications');
    let status = 'notAllowed';
    try {
        status = await window.alertServer.getUrgentStatus();
    } catch (err) {
        status = 'notAllowed';
    }
    const pills = {
        allowed: { text: strings.notifyWindowsOn, tone: 'green' },
        notAllowed: { text: strings.notifyWindowsOff, tone: 'red' },
        unsupported: { text: strings.notifyWindowsUnavailable, tone: '' },
    };
    const view = pills[status] || pills.notAllowed;
    label.textContent = strings.notifyWindowsLabel;
    pill.textContent = view.text;
    pill.className = view.tone ? `ui-badge ${view.tone}` : 'ui-badge';
    button.hidden = status === 'unsupported';
}

function setupSheet(strings) {
    const overlay = document.getElementById('notifyProfileOverlay');
    const toggle = document.getElementById('notifyProfileToggle');
    const closeButton = document.getElementById('sheetClose');
    document.getElementById('sheetTitle').textContent = strings.notifyProfileTitle;
    document.getElementById('sheetSubtitle').textContent = strings.notifyProfileHint;
    closeButton.textContent = strings.dialogClose;

    const close = () => {
        overlay.hidden = true;
        toggle.setAttribute('aria-expanded', 'false');
        toggle.focus({ preventScroll: true });
    };

    toggle.addEventListener('click', () => {
        overlay.hidden = false;
        toggle.setAttribute('aria-expanded', 'true');
        closeButton.focus({ preventScroll: true });
    });
    closeButton.addEventListener('click', close);
    overlay.addEventListener('mousedown', (event) => {
        if (event.target === overlay) close();
    });
    window.addEventListener(
        'keydown',
        (event) => {
            if (event.key === 'Escape' && !overlay.hidden) {
                event.stopImmediatePropagation();
                close();
            }
        },
        true
    );
}

function setupNotifyProfile(strings, profile, save) {
    const openButton = document.getElementById('openWindowsNotifications');
    openButton.textContent = strings.notifyWindowsOpen;
    openButton.title = strings.notifyWindowsOpenHint;
    openButton.addEventListener('click', () => window.alertServer.openNotificationSettings());
    refreshUrgentStatus(strings);
    window.addEventListener('focus', () => refreshUrgentStatus(strings));

    document.getElementById('notifyProfileTitle').textContent = strings.notifyProfileTitle;
    document.getElementById('notifyProfileHeading').textContent = strings.notifyProfileTitle;
    document.getElementById('notifyProfileHint').textContent = strings.notifyProfileHint;
    setupSheet(strings);

    const note = document.getElementById('notifyProfileNote');
    note.textContent = '';
    strings.notifyProfileNote.split('\n').forEach((line) => {
        const item = document.createElement('li');
        item.textContent = line;
        note.appendChild(item);
    });

    const table = document.getElementById('notifyProfileTable');
    table.textContent = '';

    const header = document.createElement('div');
    header.className = 'notify-row notify-header';
    [strings.notifyProfileColEvent, strings.notifyProfileColKind, strings.notifyProfileColTime].forEach((text) => {
        const cell = document.createElement('div');
        cell.textContent = text;
        header.appendChild(cell);
    });
    table.appendChild(header);

    const rowElements = new Map();

    ROWS.forEach((key) => {
        const entry = profile[key];
        const row = document.createElement('div');
        row.className = 'notify-row';
        if (key === 'forecast') row.classList.add('notify-row-separated');

        const label = document.createElement('div');
        label.className = 'notify-label';
        const dot = document.createElement('span');
        dot.className = 'notify-dot';
        dot.dataset.row = key;
        const labelText = document.createElement('span');
        labelText.textContent = strings[`notifyRow_${key}`];
        label.append(dot, labelText);

        const kind = createKindToggle(strings, entry.emergency, (isEmergency) => {
            profile[key].emergency = isEmergency;
            save(profile);
        });
        const time = createTimeSelect(strings, entry.seconds, (seconds) => {
            profile[key].seconds = seconds;
            save(profile);
        });

        row.append(label, kind.element, time);
        table.appendChild(row);
        rowElements.set(key, { row, controls: [...kind.buttons, time] });
    });

    return {
        setDisabled(whole, rows = {}) {
            rowElements.forEach(({ row, controls }, key) => {
                const disabled = whole || Boolean(rows[key]);
                row.classList.toggle('disabled', disabled);
                controls.forEach((control) => {
                    control.disabled = disabled;
                });
            });
        },
    };
}

export { setupNotifyProfile };
