// Copyright (c) 2024-2026 Serhii I. Myshko
// Licensed under the MIT License. See LICENSE for details.

// Shared with the label layer and the alert-status layer - both must switch at the exact same
// zoom level, or they'll show conflicting levels of detail against each other.
const OBLAST_MIN_ZOOM = 5;
const RAION_MIN_ZOOM = 9;

export { OBLAST_MIN_ZOOM, RAION_MIN_ZOOM };
