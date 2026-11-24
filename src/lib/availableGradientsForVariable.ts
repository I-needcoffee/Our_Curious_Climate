import type { GradientDef } from '../components/InteractiveLegend';
import type { EPWVariable } from './epwParser';

const BUILTIN_IDS = new Set([
  'temperature-comfort',
  'humidity-spectrum',
  'solar-yellow-orange',
  'direct-normal-radiation',
  'wind-speed-warm',
  'cloud-cover-gray',
  'difference-diverging',
  'turbo',
  'magma',
  'viridis',
  'coolwarm',
]);

const COLORBLIND_SAFE_IDS = ['viridis', 'magma', 'coolwarm'];

function customGradients(gradients: GradientDef[]) {
  return gradients.filter(g => !BUILTIN_IDS.has(g.id));
}

function allowIds(ids: string[], gradients: GradientDef[]) {
  const byId = new Map(gradients.map(g => [g.id, g] as const));
  const seen = new Set<string>();
  const out: GradientDef[] = [];
  for (const id of ids) {
    if (seen.has(id)) continue;
    seen.add(id);
    const g = byId.get(id);
    if (g) out.push(g);
  }
  return out;
}

export function gradientsForVariable(
  variableId: string,
  variables: EPWVariable[],
  gradients: GradientDef[]
): GradientDef[] {
  const def = variables.find(v => v.id === variableId);
  if (!def) {
    return [...allowIds(['temperature-comfort', ...COLORBLIND_SAFE_IDS], gradients), ...customGradients(gradients)];
  }

  // Explicit overrides for “special” variables.
  if (variableId === 'windDirection') {
    return [...allowIds(['turbo', ...COLORBLIND_SAFE_IDS], gradients), ...customGradients(gradients)];
  }
  if (variableId === 'totalSkyCover' || variableId === 'opaqueSkyCover') {
    return [...allowIds(['cloud-cover-gray', ...COLORBLIND_SAFE_IDS], gradients), ...customGradients(gradients)];
  }
  if (variableId === 'directNormalRadiation') {
    return [
      ...allowIds(['direct-normal-radiation', 'solar-yellow-orange', ...COLORBLIND_SAFE_IDS], gradients),
      ...customGradients(gradients),
    ];
  }

  // Category defaults.
  const cat = def.category;
  if (cat === 'Temperature' || cat === 'Comfort') {
    return [...allowIds(['temperature-comfort', ...COLORBLIND_SAFE_IDS], gradients), ...customGradients(gradients)];
  }
  if (cat === 'Humidity') {
    return [...allowIds(['humidity-spectrum', ...COLORBLIND_SAFE_IDS], gradients), ...customGradients(gradients)];
  }
  if (cat === 'Solar') {
    return [...allowIds(['solar-yellow-orange', ...COLORBLIND_SAFE_IDS], gradients), ...customGradients(gradients)];
  }
  if (cat === 'Wind') {
    return [...allowIds(['wind-speed-warm', ...COLORBLIND_SAFE_IDS], gradients), ...customGradients(gradients)];
  }

  // Fallback: default + colorblind-safe + custom gradients.
  return [...allowIds(['temperature-comfort', ...COLORBLIND_SAFE_IDS], gradients), ...customGradients(gradients)];
}

export function gradientsForUtci(gradients: GradientDef[]): GradientDef[] {
  return [...allowIds(['temperature-comfort', ...COLORBLIND_SAFE_IDS], gradients), ...customGradients(gradients)];
}
