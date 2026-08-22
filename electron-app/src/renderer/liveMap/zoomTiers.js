// Shared zoom thresholds so the label layer and the alert-status layer agree on where "oblast
// view" ends and "raion view" begins - they need to switch at the exact same zoom level, or the
// two would show conflicting levels of detail against each other.
const OBLAST_MIN_ZOOM = 5;
const RAION_MIN_ZOOM = 9;

export { OBLAST_MIN_ZOOM, RAION_MIN_ZOOM };
