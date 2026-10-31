// Copyright (c) 2024-2026 Serhii I. Myshko
// Licensed under the MIT License. See LICENSE for details.

const api = window.alertServerMessage;

async function main() {
    const info = await api.getInfo();
    if (!info) return;

    document.title = info.title || 'Alert Server';
    document.getElementById('message').textContent = info.message;

    const detail = document.getElementById('detail');
    if (info.detail) {
        detail.textContent = info.detail;
        detail.hidden = false;
    }

    const container = document.getElementById('buttons');
    let primaryButton = null;
    info.buttons.forEach((button) => {
        const element = document.createElement('button');
        element.type = 'button';
        element.className = `ui-button${button.primary ? ' primary' : ''}`;
        element.textContent = button.label;
        element.addEventListener('click', () => api.choose(button.id));
        container.appendChild(element);
        if (button.primary && !primaryButton) primaryButton = element;
    });
    if (primaryButton) primaryButton.focus();

    document.addEventListener('keydown', (event) => {
        if (event.key === 'Escape') api.choose(info.cancelId);
    });

    requestAnimationFrame(() => api.fit(document.body.scrollHeight));
}

main();
