// area_code convention (PROTOCOL.md, section 4.2). Pure TS, safe to import from UI.
//   0                 whole country
//   2..32 (even)      voivodeship, TERYT WOJ code
//   WWPPGGR as u32    gmina, 7-digit TERYT code (WW = voivodeship, last digit = gmina type);
//                     leading zero is lost for WW < 10, e.g. 0201011 -> 201011

export interface Voivodeship {
  /** TERYT WOJ code = area_code for the whole voivodeship. */
  code: number;
  /** Display name, capitalised as in the UI picker. */
  name: string;
}

export const WHOLE_COUNTRY = 0;

export const VOIVODESHIPS: readonly Voivodeship[] = [
  { code: 2, name: 'Dolnośląskie' },
  { code: 4, name: 'Kujawsko-pomorskie' },
  { code: 6, name: 'Lubelskie' },
  { code: 8, name: 'Lubuskie' },
  { code: 10, name: 'Łódzkie' },
  { code: 12, name: 'Małopolskie' },
  { code: 14, name: 'Mazowieckie' },
  { code: 16, name: 'Opolskie' },
  { code: 18, name: 'Podkarpackie' },
  { code: 20, name: 'Podlaskie' },
  { code: 22, name: 'Pomorskie' },
  { code: 24, name: 'Śląskie' },
  { code: 26, name: 'Świętokrzyskie' },
  { code: 28, name: 'Warmińsko-mazurskie' },
  { code: 30, name: 'Wielkopolskie' },
  { code: 32, name: 'Zachodniopomorskie' },
];

const BY_CODE = new Map(VOIVODESHIPS.map((v) => [v.code, v]));

export type AreaKind = 'country' | 'voivodeship' | 'gmina';

export interface AreaInfo {
  kind: AreaKind;
  code: number;
  /** Voivodeship the area belongs to (undefined for the whole country). */
  voivodeship?: Voivodeship;
}

const GMINA_MIN = 200000; // 02 00 00 0
const GMINA_MAX = 3299999; // 32 99 99 9

/** Parses an area_code; returns null when it does not follow the convention. */
export function parseAreaCode(code: number): AreaInfo | null {
  if (!Number.isInteger(code) || code < 0) return null;
  if (code === WHOLE_COUNTRY) return { kind: 'country', code };
  if (code < 100) {
    const v = BY_CODE.get(code);
    return v ? { kind: 'voivodeship', code, voivodeship: v } : null;
  }
  if (code < GMINA_MIN || code > GMINA_MAX) return null;
  const v = BY_CODE.get(Math.floor(code / 100000));
  const type = code % 10;
  // TERYT RODZ: 1..5 gmina types, 8..9 city districts (Warszawa, Kraków, Łódź, Poznań, Wrocław).
  if (!v || type === 0 || type === 6 || type === 7) return null;
  return { kind: 'gmina', code, voivodeship: v };
}

export function isValidAreaCode(code: number): boolean {
  return parseAreaCode(code) !== null;
}

/** Converts a 7-character TERYT string ("0201011") to area_code. */
export function gminaTerytToAreaCode(teryt: string): number | null {
  if (!/^\d{7}$/.test(teryt)) return null;
  const code = Number(teryt);
  return parseAreaCode(code)?.kind === 'gmina' ? code : null;
}

/** Picker name (case-insensitive, e.g. "Małopolskie") -> area_code. */
export function voivodeshipCode(name: string): number | null {
  const n = name.trim().toLocaleLowerCase('pl');
  return VOIVODESHIPS.find((v) => v.name.toLocaleLowerCase('pl') === n)?.code ?? null;
}

/** Human-readable label for notifications and lists. */
export function areaLabel(code: number): string {
  const a = parseAreaCode(code);
  if (!a) return `obszar ${code}`;
  if (a.kind === 'country') return 'Cała Polska';
  if (a.kind === 'voivodeship') return `woj. ${a.voivodeship!.name.toLocaleLowerCase('pl')}`;
  return `gmina ${String(code).padStart(7, '0')} (woj. ${a.voivodeship!.name.toLocaleLowerCase('pl')})`;
}

/** Does an alert for `alertArea` concern a user located in `userArea` (gmina or voivodeship)? */
export function areaCovers(alertArea: number, userArea: number): boolean {
  const a = parseAreaCode(alertArea);
  const u = parseAreaCode(userArea);
  if (!a || !u) return false;
  if (a.kind === 'country') return true;
  if (a.kind === 'voivodeship') return u.voivodeship?.code === a.code;
  return u.kind === 'gmina' && u.code === a.code;
}
