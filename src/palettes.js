/**
 * palettes.js — Color palette definitions
 * Colors are normalized RGB [0..1].
 * Each palette has variants for 3, 4, and 5 color sources.
 */

export const PALETTES = [
  {
    id: 'vibrant-sync',
    name: 'VIBRANT_SYNC',
    colors: {
      3: [
        { r: 0.49, g: 0.80, b: 0.96 }, // sky blue
        { r: 0.95, g: 0.63, b: 0.69 }, // rose pink
        { r: 0.44, g: 0.83, b: 0.75 }, // teal
      ],
      4: [
        { r: 0.49, g: 0.80, b: 0.96 }, // sky blue
        { r: 0.66, g: 0.72, b: 0.94 }, // periwinkle
        { r: 0.95, g: 0.63, b: 0.69 }, // rose pink
        { r: 0.44, g: 0.83, b: 0.75 }, // teal
      ],
      5: [
        { r: 0.49, g: 0.80, b: 0.96 }, // sky blue
        { r: 0.66, g: 0.72, b: 0.94 }, // periwinkle
        { r: 0.95, g: 0.63, b: 0.69 }, // rose pink
        { r: 0.44, g: 0.83, b: 0.75 }, // teal
        { r: 0.94, g: 0.75, b: 0.83 }, // blush
      ],
    },
  },
  {
    id: 'sunset',
    name: 'SUNSET',
    colors: {
      3: [
        { r: 0.94, g: 0.53, b: 0.36 }, // orange
        { r: 0.55, g: 0.50, b: 0.81 }, // purple
        { r: 0.94, g: 0.75, b: 0.56 }, // peach
      ],
      4: [
        { r: 0.94, g: 0.53, b: 0.36 }, // orange
        { r: 0.94, g: 0.75, b: 0.56 }, // peach
        { r: 0.55, g: 0.50, b: 0.81 }, // purple
        { r: 0.36, g: 0.50, b: 0.81 }, // blue
      ],
      5: [
        { r: 0.94, g: 0.53, b: 0.36 }, // orange
        { r: 0.94, g: 0.75, b: 0.56 }, // peach
        { r: 0.94, g: 0.38, b: 0.56 }, // coral
        { r: 0.55, g: 0.50, b: 0.81 }, // purple
        { r: 0.36, g: 0.50, b: 0.81 }, // blue
      ],
    },
  },
  {
    id: 'aurora',
    name: 'AURORA',
    colors: {
      3: [
        { r: 0.25, g: 0.85, b: 0.65 }, // emerald
        { r: 0.35, g: 0.60, b: 0.95 }, // royal blue
        { r: 0.65, g: 0.35, b: 0.90 }, // violet
      ],
      4: [
        { r: 0.25, g: 0.85, b: 0.65 }, // emerald
        { r: 0.25, g: 0.75, b: 0.85 }, // teal blue
        { r: 0.35, g: 0.60, b: 0.95 }, // royal blue
        { r: 0.65, g: 0.35, b: 0.90 }, // violet
      ],
      5: [
        { r: 0.25, g: 0.85, b: 0.65 }, // emerald
        { r: 0.25, g: 0.75, b: 0.85 }, // teal blue
        { r: 0.35, g: 0.60, b: 0.95 }, // royal blue
        { r: 0.55, g: 0.35, b: 0.90 }, // purple
        { r: 0.90, g: 0.35, b: 0.75 }, // magenta
      ],
    },
  },
  {
    id: 'ember',
    name: 'EMBER',
    colors: {
      3: [
        { r: 0.98, g: 0.35, b: 0.20 }, // red-orange
        { r: 0.98, g: 0.70, b: 0.10 }, // amber
        { r: 0.98, g: 0.90, b: 0.70 }, // warm cream
      ],
      4: [
        { r: 0.98, g: 0.35, b: 0.20 }, // red-orange
        { r: 0.98, g: 0.55, b: 0.10 }, // tangerine
        { r: 0.98, g: 0.70, b: 0.10 }, // amber
        { r: 0.98, g: 0.90, b: 0.70 }, // warm cream
      ],
      5: [
        { r: 0.70, g: 0.15, b: 0.10 }, // deep red
        { r: 0.98, g: 0.35, b: 0.20 }, // red-orange
        { r: 0.98, g: 0.55, b: 0.10 }, // tangerine
        { r: 0.98, g: 0.75, b: 0.10 }, // amber
        { r: 0.98, g: 0.92, b: 0.70 }, // warm cream
      ],
    },
  },
  {
    id: 'ocean',
    name: 'OCEAN',
    colors: {
      3: [
        { r: 0.05, g: 0.30, b: 0.70 }, // deep navy
        { r: 0.10, g: 0.65, b: 0.80 }, // ocean teal
        { r: 0.60, g: 0.90, b: 0.88 }, // seafoam
      ],
      4: [
        { r: 0.05, g: 0.20, b: 0.60 }, // deep navy
        { r: 0.05, g: 0.45, b: 0.80 }, // mid blue
        { r: 0.10, g: 0.65, b: 0.80 }, // ocean teal
        { r: 0.60, g: 0.90, b: 0.88 }, // seafoam
      ],
      5: [
        { r: 0.05, g: 0.10, b: 0.45 }, // midnight
        { r: 0.05, g: 0.30, b: 0.70 }, // deep navy
        { r: 0.05, g: 0.55, b: 0.85 }, // mid blue
        { r: 0.10, g: 0.70, b: 0.80 }, // teal
        { r: 0.60, g: 0.92, b: 0.88 }, // seafoam
      ],
    },
  },
  {
    id: 'dusk',
    name: 'DUSK',
    colors: {
      3: [
        { r: 0.55, g: 0.40, b: 0.75 }, // purple
        { r: 0.90, g: 0.55, b: 0.65 }, // rose
        { r: 0.60, g: 0.65, b: 0.85 }, // blue-gray
      ],
      4: [
        { r: 0.45, g: 0.30, b: 0.65 }, // deep purple
        { r: 0.75, g: 0.50, b: 0.80 }, // lavender
        { r: 0.90, g: 0.55, b: 0.65 }, // rose
        { r: 0.60, g: 0.65, b: 0.85 }, // blue-gray
      ],
      5: [
        { r: 0.30, g: 0.20, b: 0.55 }, // deep violet
        { r: 0.55, g: 0.40, b: 0.75 }, // purple
        { r: 0.80, g: 0.50, b: 0.78 }, // mauve
        { r: 0.92, g: 0.58, b: 0.65 }, // rose
        { r: 0.65, g: 0.70, b: 0.88 }, // blue-gray
      ],
    },
  },
  {
    id: 'neon',
    name: 'NEON',
    colors: {
      3: [
        { r: 1.00, g: 0.20, b: 0.80 }, // hot pink
        { r: 0.20, g: 0.50, b: 1.00 }, // electric blue
        { r: 0.60, g: 0.10, b: 1.00 }, // violet
      ],
      4: [
        { r: 1.00, g: 0.20, b: 0.80 }, // hot pink
        { r: 1.00, g: 0.60, b: 0.10 }, // neon orange
        { r: 0.20, g: 0.50, b: 1.00 }, // electric blue
        { r: 0.60, g: 0.10, b: 1.00 }, // violet
      ],
      5: [
        { r: 1.00, g: 0.10, b: 0.60 }, // magenta
        { r: 1.00, g: 0.20, b: 0.80 }, // hot pink
        { r: 1.00, g: 0.70, b: 0.10 }, // neon yellow
        { r: 0.10, g: 0.60, b: 1.00 }, // electric blue
        { r: 0.55, g: 0.10, b: 1.00 }, // violet
      ],
    },
  },
  {
    id: 'frost',
    name: 'FROST',
    colors: {
      3: [
        { r: 0.85, g: 0.92, b: 1.00 }, // ice white
        { r: 0.65, g: 0.82, b: 0.95 }, // ice blue
        { r: 0.80, g: 0.75, b: 0.92 }, // pale lavender
      ],
      4: [
        { r: 0.90, g: 0.95, b: 1.00 }, // near white
        { r: 0.70, g: 0.85, b: 0.98 }, // ice blue
        { r: 0.75, g: 0.80, b: 0.95 }, // periwinkle frost
        { r: 0.85, g: 0.78, b: 0.95 }, // pale lavender
      ],
      5: [
        { r: 0.95, g: 0.97, b: 1.00 }, // near white
        { r: 0.72, g: 0.86, b: 0.98 }, // ice blue
        { r: 0.65, g: 0.78, b: 0.96 }, // steel blue
        { r: 0.78, g: 0.80, b: 0.96 }, // periwinkle
        { r: 0.88, g: 0.80, b: 0.96 }, // pale violet
      ],
    },
  },
];

export const DEFAULT_PALETTE_INDEX = 0;
export const DEFAULT_COLOR_COUNT = 5;
