import { DIFFERENCE_DIVERGING_COLORS, DIFFERENCE_DIVERGING_ID } from './differenceDivergingColor';

/**
 * Water fill aligned with OpenFreeMap Positron (`water` layer `rgb(194, 200, 202)`).
 * Used behind the map, map shell, and light‑theme dashboard canvas so empty areas match ocean
 * on the opening screen.
 */
export const CARTO_LIGHT_ALL_WATER_HEX = '#c2c8ca';

/** Outdoor comfort green — CMYK 77, 22, 89, 7 (≈ #37B91A). */
export const OUTDOOR_COMFORT_GREEN_HEX = '#37B91A';
export const OUTDOOR_COMFORT_GREEN_RGB = { r: 55, g: 185, b: 26 } as const;

/** Calm sky blue for natural-ventilation suitable-hours encoding (distinct from UTCI green). */
export const NATURAL_VENTILATION_SUITABLE_BLUE_HEX = '#6BAED6';

/**
 * Temperature heatmap palette from EPW tooling (`temperature_js.html` Plotly colorscale /
 * annotation colors). Blue → teal → green → yellow → orange (cool → warm).
 */
export const TEMPERATURE_COMFORT_GRADIENT_COLORS = [
  '#0069b4',
  '#40b2a6',
  OUTDOOR_COMFORT_GREEN_HEX,
  '#fde767',
  '#f06441',
] as const;

export const GRADIENTS = [
  {
    id: 'temperature-comfort',
    name: 'Temperature (comfort)',
    colors: [...TEMPERATURE_COMFORT_GRADIENT_COLORS],
  },
  /** Default for comparison “difference” heatmaps: muted blue → white (0) → muted burnt orange (temperature ramp family). */
  {
    id: DIFFERENCE_DIVERGING_ID,
    name: 'Difference (cool — neutral — warm)',
    colors: [...DIFFERENCE_DIVERGING_COLORS],
  },
  /** Dry → humid: warm low-end, neutral mid, stronger blue at high RH. */
  {
    id: 'humidity-spectrum',
    name: 'Humidity (dry→humid)',
    colors: ['#e79d18', '#cbbba0', '#e5e7eb', '#bcd0e7', '#7ea6d6', '#4f7fbf', '#2f66aa', '#1f4f8a'],
  },
  /** Solar radiation (`solar_radiation_js.html`): yellow → orange. */
  {
    id: 'solar-yellow-orange',
    name: 'Solar (yellow→orange)',
    colors: ['#ffff00', '#d97706'],
  },
  /**
   * Direct normal radiation (0–1000 Wh/m²): light grey at 0, yellow from ~250, dark orange at 1000.
   * Legend shows five ticks; {@link directNormalRadiationParameter} shapes chart coloring.
   */
  {
    id: 'direct-normal-radiation',
    name: 'Direct normal (white→yellow→orange)',
    colors: ['#e8eaed', '#fef9c3', '#ffff00', '#f97316', '#c2410c'],
  },
  /** Wind: calm → storm — white → blue/teal/green → warm (no purple). */
  {
    id: 'wind-speed-warm',
    name: 'Wind speed (calm→storm)',
    colors: [
      '#ffffff',
      '#d3ebfb', // lighter sky-blue (less muddy grey)
      '#4a8f92', // muted teal
      '#43bc7b', // richer muted green (more chroma vs prior)
      '#eab308', // yellow
      '#f97316', // orange
      '#ef4444', // red
    ],
  },
  /** Cloud cover (`Cloud Cover_js.html`): white → mid grey for 0–100% cover. */
  {
    id: 'cloud-cover-gray',
    name: 'Sky cover (clear→overcast)',
    colors: ['#ffffff', '#969696'],
  },
  { id: 'turbo', name: 'Turbo', colors: ['#30123B', '#4686FB', '#1AE4B6', '#A4FC3C', '#FABA39', '#E4460A', '#7A0403'] },
  { id: 'magma', name: 'Magma', colors: ['#000004', '#3B0F70', '#8C2981', '#DE4968', '#FE9F6D', '#FCFDBF'] },
  { id: 'viridis', name: 'Viridis', colors: ['#440154', '#414487', '#2A788E', '#22A884', '#7AD151', '#FDE725'] },
  { id: 'coolwarm', name: 'Cool to Warm', colors: ['#3B4CC0', '#8DB0FE', '#E2E2E2', '#F49A7B', '#B40426'] },
];

export const VARIABLES = [
  { id: 'temperature', name: 'Temperature (°C)', min: -10, max: 40 },
  { id: 'radiation', name: 'Solar Radiation (W/m²)', min: 0, max: 1000 },
  { id: 'windSpeed', name: 'Wind Speed (m/s)', min: 0, max: 15 },
  { id: 'humidity', name: 'Relative Humidity (%)', min: 0, max: 100 },
];
