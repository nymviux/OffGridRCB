import { CATEGORY_LABEL, type Category } from '../ble';

// UI metadata per category (PROTOCOL.md 4.1). Severity comes from the signed alert, not from here.

export interface CategoryInfo {
  label: string;
  icon: string;
  /** Service the category is modelled on. */
  source: 'RCB' | 'GOPR' | 'WOPR' | 'PSP' | 'PRM';
}

const META: Record<Category, Omit<CategoryInfo, 'label'>> = {
  other: { icon: '⚠️', source: 'RCB' },
  fire: { icon: '🔥', source: 'PSP' },
  flood: { icon: '🌊', source: 'RCB' },
  accident: { icon: '🚧', source: 'RCB' },
  medical: { icon: '🚑', source: 'PRM' },
  storm: { icon: '⛈️', source: 'RCB' },
  strong_wind: { icon: '💨', source: 'RCB' },
  heat: { icon: '🌡️', source: 'RCB' },
  frost: { icon: '🥶', source: 'RCB' },
  heavy_snow: { icon: '❄️', source: 'RCB' },
  chemical_hazard: { icon: '☣️', source: 'RCB' },
  air_threat: { icon: '🚨', source: 'RCB' },
  power_outage: { icon: '🔌', source: 'RCB' },
  water_contamination: { icon: '🚱', source: 'RCB' },
  missing_person: { icon: '🔎', source: 'RCB' },
  avalanche: { icon: '🏔️', source: 'GOPR' },
  mountain_danger: { icon: '⛰️', source: 'GOPR' },
  water_rescue: { icon: '🛟', source: 'WOPR' },
};

export function categoryInfo(c: Category): CategoryInfo {
  return { label: CATEGORY_LABEL[c], ...(META[c] ?? META.other) };
}
