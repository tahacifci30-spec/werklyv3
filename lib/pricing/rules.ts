/**
 * Prijsregels. Alle bedragen in euro, inclusief btw: richtbedragen voor de prijsindicatie.
 * Per bedrijf aan te passen in Instellingen (opgeslagen in company_settings.pricing).
 * PLACEHOLDER-bedragen: pas deze aan naar de echte tarieven van het bedrijf.
 */
export type PricingRules = {
  firstUnit: number;
  extraUnit: number;
  /** Aantal units per antwoord op "spaces" ("unknown" telt als 1) */
  unitsBySpaces: Record<string, number>;
  areaSurcharge: Record<string, number>;
  propertySurcharge: Record<string, number>;
  /** Waar de buitenunit komt (gevel, balkon, dak, tuin) */
  outdoorSurcharge: Record<string, number>;
  /** Alleen bij meerdere ruimtes */
  systemSurcharge: Record<string, number>;
  /** Alleen bij één ruimte */
  existingAdjustment: Record<string, number>;
  /** Marge rond het middenbedrag */
  spreadLow: number;
  spreadHigh: number;
  /** Extra spreiding per onbekende factor */
  unknownSpread: number;
  rounding: number;
  quote: {
    installation: number;
    extraPipeMid: number;
    extraPipeLong: number;
    hardWall: number;
    meterBoxWork: number;
  };
};

export const DEFAULT_RULES: PricingRules = {
  firstUnit: 1850,
  extraUnit: 1350,
  unitsBySpaces: { living: 1, bedroom: 1, living_bedroom: 2, multiple: 3 },
  areaSurcharge: { lt20: 0, "20_30": 250, "30_40": 500, gt40: 900 },
  propertySurcharge: { apartment: 0, terraced: 0, corner: 100, detached: 200 },
  outdoorSurcharge: { facade: 0, balcony: 0, roof: 350, ground: 200 },
  systemSurcharge: { multisplit: 350, separate: 0 },
  existingAdjustment: { none: 0, replace: -150, piping: -250 },
  spreadLow: 0.92,
  spreadHigh: 1.15,
  unknownSpread: 0.04,
  rounding: 50,
  quote: {
    installation: 650,
    extraPipeMid: 150,
    extraPipeLong: 300,
    hardWall: 120,
    meterBoxWork: 250,
  },
};

/**
 * Vult opgeslagen regels aan met standaardwaarden, zodat regels uit een eerdere versie
 * (zonder nieuwe velden, met oude velden) blijven werken.
 */
export function mergeRules(stored?: Partial<PricingRules> | null): PricingRules {
  const out = structuredClone(DEFAULT_RULES) as unknown as Record<string, unknown>;
  if (!stored) return out as unknown as PricingRules;
  for (const [key, def] of Object.entries(DEFAULT_RULES)) {
    const v = (stored as Record<string, unknown>)[key];
    if (v === undefined || v === null) continue;
    out[key] = typeof def === "object" ? { ...(def as object), ...(v as object) } : v;
  }
  return out as unknown as PricingRules;
}
