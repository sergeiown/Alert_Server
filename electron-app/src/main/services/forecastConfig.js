module.exports = {
    WINDOW_DAYS: 30,
    HALF_LIFE_DAYS: 1,
    PRIOR_BETA_DAYS: 4,
    NOTIFY_LOOKAHEAD_MINUTES: 120,
    // Long-horizon floor so lambda plateaus instead of decaying to zero during a long silence.
    BASELINE_HALF_LIFE_DAYS: 21,
    BASELINE_WINDOW_DAYS: 90,
};
