// Copyright (c) 2024-2026 Serhii I. Myshko
// Licensed under the MIT License. See LICENSE for details.

function formatDuration(ms, strings) {
    const totalMinutes = Math.round(ms / 60000);
    const days = Math.floor(totalMinutes / (60 * 24));
    const hours = Math.floor((totalMinutes % (60 * 24)) / 60);
    const minutes = totalMinutes % 60;

    const parts = [];
    if (days) parts.push(`${days}${strings.unitDay}`);
    if (hours) parts.push(`${hours}${strings.unitHour}`);
    if (!days && minutes) parts.push(`${minutes}${strings.unitMinute}`);

    return parts.length ? parts.join(' ') : `<1${strings.unitMinute}`;
}

function formatStartedAt(startedAt, locale) {
    const started = new Date(startedAt);
    const now = new Date();
    const sameDay =
        started.getFullYear() === now.getFullYear() &&
        started.getMonth() === now.getMonth() &&
        started.getDate() === now.getDate();

    const timeText = started.toLocaleTimeString(locale);
    return sameDay ? timeText : `${started.toLocaleDateString(locale)} ${timeText}`;
}

function alertPopupHtml(displayName, startedAt, strings, language, inheritedFromName) {
    const locale = language === 'English' ? 'en-US' : 'uk-UA';

    if (!startedAt) {
        return `<strong>${displayName}</strong><br>${strings.liveMapNoActiveAlert}`;
    }

    const startedTime = formatStartedAt(startedAt, locale);
    const duration = formatDuration(Date.now() - new Date(startedAt).getTime(), strings);
    const note = inheritedFromName
        ? `<br><small>${strings.liveMapAlertAcrossRegion.replace('{name}', inheritedFromName)}</small>`
        : '';

    return (
        `<strong>${displayName}</strong><br>` +
        `${strings.alertStarted}: ${startedTime}<br>` +
        `${strings.alertDuration}: ${duration}${note}`
    );
}

export { alertPopupHtml };
