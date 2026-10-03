import { describe, expect, it } from 'vitest';
import {
  VOIVODESHIPS,
  areaCovers,
  areaLabel,
  gminaTerytToAreaCode,
  isValidAreaCode,
  parseAreaCode,
  voivodeshipCode,
} from '../regions';

describe('area_code convention', () => {
  it('has 16 voivodeships with even TERYT codes 2..32', () => {
    expect(VOIVODESHIPS.map((v) => v.code)).toEqual([2, 4, 6, 8, 10, 12, 14, 16, 18, 20, 22, 24, 26, 28, 30, 32]);
  });

  it('maps picker names to codes', () => {
    expect(voivodeshipCode('Małopolskie')).toBe(12);
    expect(voivodeshipCode('Mazowieckie')).toBe(14);
    expect(voivodeshipCode('Podkarpackie')).toBe(18);
    expect(voivodeshipCode('  małopolskie ')).toBe(12);
    expect(voivodeshipCode('ŚLĄSKIE')).toBe(24);
    expect(voivodeshipCode('Galicja')).toBeNull();
  });

  it('classifies codes', () => {
    expect(parseAreaCode(0)?.kind).toBe('country');
    expect(parseAreaCode(12)).toMatchObject({ kind: 'voivodeship', voivodeship: { name: 'Małopolskie' } });
    expect(parseAreaCode(1261011)).toMatchObject({ kind: 'gmina', voivodeship: { code: 12 } }); // Kraków
    expect(parseAreaCode(1465011)).toMatchObject({ kind: 'gmina', voivodeship: { code: 14 } }); // Warszawa
    expect(parseAreaCode(201011)).toMatchObject({ kind: 'gmina', voivodeship: { code: 2 } }); // 0201011
  });

  it.each([1, 13, 34, 99, 100, 199999, 1300001, 3400001, 1261010, 1261016, 1261017, -1, 1.5])('rejects %s', (c) => {
    expect(isValidAreaCode(c)).toBe(false);
  });

  it('converts 7-char TERYT strings', () => {
    expect(gminaTerytToAreaCode('0201011')).toBe(201011);
    expect(gminaTerytToAreaCode('1465011')).toBe(1465011);
    expect(gminaTerytToAreaCode('146501')).toBeNull();
    expect(gminaTerytToAreaCode('12')).toBeNull();
  });

  it('labels', () => {
    expect(areaLabel(0)).toBe('Cała Polska');
    expect(areaLabel(18)).toBe('woj. podkarpackie');
    expect(areaLabel(201011)).toBe('gmina 0201011 (woj. dolnośląskie)');
  });

  it('coverage', () => {
    expect(areaCovers(0, 1261011)).toBe(true);
    expect(areaCovers(12, 1261011)).toBe(true);
    expect(areaCovers(12, 12)).toBe(true);
    expect(areaCovers(14, 1261011)).toBe(false);
    expect(areaCovers(1261011, 1261011)).toBe(true);
    expect(areaCovers(1261011, 12)).toBe(false);
  });
});
