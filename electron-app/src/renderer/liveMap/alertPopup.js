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

    const startedTime = new Date(startedAt).toLocaleTimeString(locale);
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
