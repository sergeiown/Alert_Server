module.exports = {
    WINDOW_DAYS: 30,
    HALF_LIFE_DAYS: 1,
    // Locations/types above HALF_LIFE_HIGH_COUNT usable alerts react faster, down to
    // HALF_LIFE_MIN_DAYS; at or below HALF_LIFE_LOW_COUNT a single recent alert is weak evidence,
    // so they keep the slower HALF_LIFE_DAYS.
    HALF_LIFE_MIN_DAYS: 0.15,
    HALF_LIFE_LOW_COUNT: 5,
    HALF_LIFE_HIGH_COUNT: 40,
    PRIOR_BETA_DAYS: 4,
    NOTIFY_LOOKAHEAD_MINUTES: 120,
    // Long-horizon floor so lambda plateaus instead of decaying to zero during a long silence.
    BASELINE_HALF_LIFE_DAYS: 21,
    BASELINE_WINDOW_DAYS: 90,
    // Day-of-week adjustment: how many same-weekday occurrences are needed before trusting the
    // weekday-specific rate as much as the raw ratio suggests (fewer occurrences -> shrunk toward
    // no adjustment), and the max factor the adjustment can ever scale the estimate by either way.
    SEASONALITY_PRIOR_OCCURRENCES: 20,
    SEASONALITY_MAX_MULTIPLIER: 2,
    // Minimum historical gap count before showing a low-high range alongside the point ETA.
    MIN_GAP_SAMPLES_FOR_RANGE: 8,
};
