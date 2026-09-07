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

// A source_message for a whole city aggregation (currently only "м. Київ" does this across all
// three sources - confirmed live, not something hardcoded to it specifically, since any place with
// this same reporting shape would parse the same way) lists one entry per affected district, all
// sharing the same threat description with only the trailing district name differing -
// "Ракетна загроза (червоний рівень) Дарницький район", "... Печерський район", and so on. Split
// into the shared description (up to the closing parenthesis) and the district name (everything
// after it, or null when there isn't one - an ordinary single-district alert's message has no
// trailing name at all).
function splitThreatMessage(message) {
    const match = message.match(/^(.*?\))\s*(.*)$/);
    if (!match) return { description: message, district: null };
    return { description: match[1], district: match[2] || null };
}

// "Дарницький район" -> "Дарницький" - the word "район" itself is only worth saying once, after
// the whole list, not repeated after every single name in it.
function stripDistrictSuffix(district) {
    return district.replace(/\s*район(?:у|і)?$/i, '').trim();
}

// threats[] can carry more than one concurrent distinct threat (e.g. an ongoing drone alert that a
// missile threat later joins), each with its own human-readable source_message already in the
// source's own language - shown as-is rather than re-translated (same treatment alert.notes
// already gets elsewhere). Grouped by description, one per line, with the specific districts named
// alongside it when the source broke them out (a wide-area alert covering many districts would
// otherwise repeat the same description once per district, unreadable as one run-together string).
function describeThreats(threats) {
    if (!threats || !threats.length) return null;

    const districtsByDescription = new Map();
    threats.forEach((threat) => {
        if (!threat.source_message) return;
        const { description, district } = splitThreatMessage(threat.source_message);
        if (!districtsByDescription.has(description)) districtsByDescription.set(description, new Set());
        if (district) districtsByDescription.get(description).add(district);
    });

    const lines = [...districtsByDescription.entries()].map(([description, districts]) => {
        if (!districts.size) return `${description}:`;
        const names = [...districts].map(stripDistrictSuffix);
        const word = names.length === 1 ? 'район' : 'райони';
        return `${description}: ${names.join(', ')} ${word}`;
    });
    return lines.length ? lines.join('\n') : null;
}

module.exports = { levelColor, worstLevelAmong, describeThreats };
