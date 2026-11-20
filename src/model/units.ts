/** A derived length in millimetres. Never an edited value. */
export type Mm = number;

export type LengthUnit = 'in' | 'mm';

/**
 * A length the user typed. `mm` is the truth; `unit` is the unit its field shows it in, kept with
 * the value until the field's toggle changes it. What is shown is always worked out from the two.
 */
export interface Length {
  mm: Mm;
  unit: LengthUnit;
}

/**
 * The unit each plain number of mm on a thing is shown in, by the value's path in it (`probe.maxTravel`,
 * `look.length`). A value not named is shown in mm. The numbers themselves are always mm.
 */
export type ShownIn = Record<string, LengthUnit>;

export type LengthDisplay =
  | { kind: 'fractionalInch'; denominator: 16 | 32 | 64 }
  | { kind: 'decimalInch'; places: number }
  | { kind: 'mm'; places: number };

/** What a feed is shown and typed in. Stored feeds are always mm/min. */
export type FeedUnit = 'mm/s' | 'mm/min' | 'in/min';
/** What a chip load is shown and typed in: mm or inches a tooth. */
export type ChipLoadUnit = 'mm' | 'in';

export interface UnitPreferences {
  /**
   * Where there is no field (a worked-out size, a table, a list), the unit goes by the kind of thing,
   * not by the screen it is on. A field keeps its own unit.
   *
   * Sizes: cabinets, rooms, openings, doors and drawers, sheets and stock, machine travel. Starts as inches.
   */
  sizes: LengthDisplay;
  /** Saw lists: the saw cut list, the by-hand steps, what to buy. Starts as inches. */
  sawLists: LengthDisplay;
  /** CNC and tooling: Plan's tables, depths, tabs, clearances, the probe, hardware specs, material thickness. Starts as mm. */
  cnc: LengthDisplay;
  /** `1/4" end mill (6.35 mm)` */
  bits: 'nameWithMm';
  /** One choice for the whole shop: flipping any feed field flips them all. Starts at mm/s. */
  feed: FeedUnit;
  /** One choice for the shop, and its own: it does not follow the feeds. Starts at mm a tooth. */
  chipLoad: ChipLoadUnit;
}
