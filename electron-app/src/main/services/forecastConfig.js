// Copyright (c) 2024-2026 Serhii I. Myshko
// Licensed under the MIT License. See LICENSE for details.

module.exports = {
    WINDOW_DAYS: 30,
    HALF_LIFE_DAYS: 1,
    // "Probability of at least one alert TODAY" mathematically saturates to (an honestly correct,
    // but uninformative) ~100% for any region averaging much more than roughly 5/day - which the
    // current pace of the war makes common. A shorter, fixed window keeps the same probability
    // genuinely differentiated across the whole range of regions instead of flattening the busy
    // ones together, and lines up naturally with the ETA already shown right next to it.
    PROBABILITY_WINDOW_HOURS: 2,
    PRIOR_BETA_DAYS: 4,
    NOTIFY_LOOKAHEAD_MINUTES: 120,
    // Floor so lambda plateaus instead of decaying to zero during a long silence; 5-day half-life
    // calibrated via scripts/calibrate-baseline.js against real siren history.
    BASELINE_HALF_LIFE_DAYS: 5,
    BASELINE_WINDOW_DAYS: 180,
    SEASONALITY_PRIOR_OCCURRENCES: 20,
    SEASONALITY_MAX_MULTIPLIER: 2,
    // Larger prior than the weekday one: hour-of-day occurrences accumulate roughly 7x faster (every
    // calendar day contributes one), so more of them are needed for comparable real-world trust.
    HOUR_OF_DAY_PRIOR_OCCURRENCES: 60,
    HOUR_OF_DAY_MAX_MULTIPLIER: 2,
    MIN_GAP_SAMPLES_FOR_RANGE: 8,
    GAP_RANGE_LOW_PERCENTILE: 0.35,
    GAP_RANGE_HIGH_PERCENTILE: 0.65,
    GAP_RANGE_MAX_RATIO: 3,
};
