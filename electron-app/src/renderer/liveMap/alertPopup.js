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

// A bare time ("Тривога: 00:22:00") reads as "just now-ish" - fine for the overwhelming majority
// of alerts (started earlier today), but misleading for the rare region whose alert has been
// running for days (a real, if unusual, case - e.g. Crimea's siren feed has been continuously "on"
// for years). The date is only added when it's actually needed, so the common case stays as short
// as before.
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

// Builds the popup content shown when the user clicks an oblast, raion, or city - `startedAt` is
// the region's own alert start time if it has one right now, or null/undefined if it doesn't.
// `inheritedFromName` names the broader region (e.g. the enclosing oblast) when `startedAt` is
// actually that region's alert, not this one's own - the raion/city itself has none, but sits
// inside a region that is currently under a wider alert.
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
