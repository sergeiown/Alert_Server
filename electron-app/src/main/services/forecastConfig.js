module.exports = {
    WINDOW_DAYS: 30,
    HALF_LIFE_DAYS: 1,
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
    // Hour-of-day adjustment: same shrink-to-neutral principle as the day-of-week one above, but
    // for the 24 hour-of-day buckets. Occurrences of "this hour" accumulate roughly 7x faster than
    // a single weekday does (every calendar day contributes one), so the prior needs to be larger
    // for a comparable amount of real-world trust before the adjustment leans in fully.
    HOUR_OF_DAY_PRIOR_OCCURRENCES: 60,
    HOUR_OF_DAY_MAX_MULTIPLIER: 2,
    // Minimum historical gap count before showing a low-high range alongside the point ETA.
    MIN_GAP_SAMPLES_FOR_RANGE: 8,
};
