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

// threats[] can carry more than one concurrent distinct threat (e.g. an ongoing drone alert that a
// missile threat later joins), each with its own human-readable source_message already in the
// source's own language - shown as-is rather than re-translated (same treatment alert.notes
// already gets elsewhere). Deduplicated since sources sometimes echo the same message across
// near-identical threat entries.
function describeThreats(threats) {
    if (!threats || !threats.length) return null;
    const messages = [...new Set(threats.map((threat) => threat.source_message).filter(Boolean))];
    return messages.length ? messages.join(' / ') : null;
}

module.exports = { levelColor, worstLevelAmong, describeThreats };
