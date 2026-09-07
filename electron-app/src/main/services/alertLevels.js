// Copyright (c) 2024-2026 Serhii I. Myshko
// Licensed under the MIT License. See LICENSE for details.

const { transliterate } = require('./transliterate');

const LEVEL_COLOR = { red: '#dc2626', yellow: '#eab308' };
const DEFAULT_COLOR = '#dc2626';

function levelColor(alertLevel) {
    return LEVEL_COLOR[alertLevel] || DEFAULT_COLOR;
}

function worstLevelAmong(alerts) {
    if (alerts.some((alert) => alert.alert_level === 'red')) return 'red';
    if (alerts.some((alert) => alert.alert_level === 'yellow')) return 'yellow';
    return null;
}

function splitThreatMessage(message) {
    const match = message.match(/^(.*?\))\s*(.*)$/);
    if (!match) return { description: message, district: null };
    return { description: match[1], district: match[2] || null };
}

function stripDistrictSuffix(district) {
    return district.replace(/\s*район(?:у|і)?$/i, '').trim();
}

const KNOWN_DESCRIPTION_EN = {
    'Дронова загроза': 'Drone threat',
    'Ракетна загроза': 'Missile threat',
};
const LEVEL_LABEL_EN = { red: 'red level', yellow: 'yellow level' };

function translateDescription(description, level) {
    const match = description.match(/^(.*?)\s*\(([^)]*)\)\s*$/u);
    const base = match ? match[1].trim() : description;
    const translatedBase = KNOWN_DESCRIPTION_EN[base] || base;
    const levelLabel = LEVEL_LABEL_EN[level];
    return levelLabel ? `${translatedBase} (${levelLabel})` : translatedBase;
}

function getThreatLines(threats, language) {
    if (!threats || !threats.length) return [];
    const isEnglish = language === 'English';

    const districtsByDescription = new Map();
    const levelByDescription = new Map();
    threats.forEach((threat) => {
        if (!threat.source_message) return;
        const { description, district } = splitThreatMessage(threat.source_message);
        if (!districtsByDescription.has(description)) districtsByDescription.set(description, new Set());
        if (district) districtsByDescription.get(description).add(district);
        if (!levelByDescription.has(description)) levelByDescription.set(description, threat.level);
    });

    return [...districtsByDescription.entries()].map(([description, districts]) => {
        const level = levelByDescription.get(description);
        const displayDescription = isEnglish ? translateDescription(description, level) : description;
        if (!districts.size) return { level, text: `${displayDescription}:` };
        const names = [...districts].map(stripDistrictSuffix).map((name) => (isEnglish ? transliterate(name) : name));
        const word = isEnglish ? (names.length === 1 ? 'district' : 'districts') : names.length === 1 ? 'район' : 'райони';
        return { level, text: `${displayDescription}: ${names.join(', ')} ${word}` };
    });
}

function describeThreats(threats, language) {
    const lines = getThreatLines(threats, language);
    return lines.length ? lines.map((line) => line.text).join('\n') : null;
}

module.exports = { levelColor, worstLevelAmong, describeThreats, getThreatLines };
