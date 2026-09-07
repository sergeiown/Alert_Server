// Copyright (c) 2024-2026 Serhii I. Myshko
// Licensed under the MIT License. See LICENSE for details.

// Shared helpers for the red/yellow alert_level (+ threats[]) fields all three live sources now
// carry on every alert - alerts.in.ua natively, UkraineAlarm/Neptun normalized to match by
// alert-proxy/src/index.js and neptunAlertsSource.js. Used by every surface that shows or colors
// an alert (notifications, live map, tray popup, Forecast window) so they all agree on one
// vocabulary rather than each re-deriving it.

const LEVEL_COLOR = { red: '#dc2626', yellow: '#eab308' };
const DEFAULT_COLOR = '#dc2626';

function levelColor(alertLevel) {
    return LEVEL_COLOR[alertLevel] || DEFAULT_COLOR;
}

// "red" outranks "yellow" outranks no level reported at all - for picking one representative
// color/label out of a group of alerts (e.g. a mass-start notification covering several regions).
function worstLevelAmong(alerts) {
    if (alerts.some((alert) => alert.alert_level === 'red')) return 'red';
    if (alerts.some((alert) => alert.alert_level === 'yellow')) return 'yellow';
    return null;
}

// A source_message for a whole oblast/city aggregation (e.g. Neptun's own entry for "м. Київ")
// lists one line per affected district, all sharing the same threat description with only the
// district name differing - "Ракетна загроза (червоний рівень) Дарницький район", "...
// Печерський район", and so on, one per district. Trimmed down to just the part up to the closing
// parenthesis so those all collapse into the one threat description they actually share, instead
// of reading as a dozen near-identical entries strung together.
function normalizeThreatMessage(message) {
    const match = message.match(/^(.*?\))/);
    return match ? match[1] : message;
}

// threats[] can carry more than one concurrent distinct threat (e.g. an ongoing drone alert that a
// missile threat later joins), each with its own human-readable source_message already in the
// source's own language - shown as-is rather than re-translated (same treatment alert.notes
// already gets elsewhere). One per line (not run together) since each is its own distinct threat,
// deduplicated after normalization since sources sometimes echo the same description many times
// over (once per district) for one wide-area alert.
function describeThreats(threats) {
    if (!threats || !threats.length) return null;
    const messages = [...new Set(threats.map((threat) => threat.source_message).filter(Boolean).map(normalizeThreatMessage))];
    return messages.length ? messages.map((message) => `${message}:`).join('\n') : null;
}

module.exports = { levelColor, worstLevelAmong, describeThreats };
