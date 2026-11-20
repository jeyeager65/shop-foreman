import type { Length } from '@/model';

export const MM_PER_INCH = 25.4;

const NUM = String.raw`(?:\d+(?:\.\d+)?|\.\d+)`;
const MM_RE = new RegExp(String.raw`^(${NUM})\s*mm$`);
const FEET_RE = new RegExp(String.raw`^(${NUM})\s*(?:'|ft)\s*(.*)$`);
const INCH_MARK_RE = /\s*(?:"|in)$/;
/** `3/4`, `1-1/2`, `1 1/2` */
const FRACTION_RE = /^(?:(\d+)(?:\s*-\s*|\s+))?(\d+)\s*\/\s*(\d+)$/;
const DECIMAL_RE = new RegExp(`^${NUM}$`);

/** Inches from `3/4`, `1-1/2`, `1 1/2` or `1.5`; null if not one of those. */
function parseInchNumber(s: string): { inches: number; isFraction: boolean } | null {
  const f = FRACTION_RE.exec(s);
  if (f) {
    const den = Number(f[3]);
    if (den === 0) return null;
    return { inches: Number(f[1] ?? 0) + Number(f[2]) / den, isFraction: true };
  }
  if (DECIMAL_RE.test(s)) return { inches: Number(s), isFraction: false };
  return null;
}

/**
 * Parse a typed length: `3/4`, `1-1/2"`, `2' 6"`, `19mm`, `0.75in`.
 *
 * A bare number (`19`) takes `defaultUnit`: the unit its field is showing. A bare fraction (`3/4`)
 * is always inches, and feet and inches come back as inches. The length carries the unit it was
 * typed in. Returns null when the text is not a length; negatives are rejected.
 */
export function parseLength(input: string, defaultUnit: 'in' | 'mm' = 'in'): Length | null {
  const s = input
    .trim()
    .toLowerCase()
    .replace(/[“”″]/g, '"')
    .replace(/[‘’′]/g, "'");
  if (s === '') return null;

  const mm = MM_RE.exec(s);
  if (mm) return { mm: Number(mm[1]), unit: 'mm' };

  const feet = FEET_RE.exec(s);
  if (feet) {
    const rest = (feet[2] ?? '').replace(INCH_MARK_RE, '').trim();
    const inches = rest === '' ? { inches: 0 } : parseInchNumber(rest);
    if (!inches) return null;
    return { mm: (Number(feet[1]) * 12 + inches.inches) * MM_PER_INCH, unit: 'in' };
  }

  const marked = INCH_MARK_RE.test(s);
  const parsed = parseInchNumber(s.replace(INCH_MARK_RE, '').trim());
  if (!parsed) return null;
  if (marked || parsed.isFraction || defaultUnit === 'in') {
    return { mm: parsed.inches * MM_PER_INCH, unit: 'in' };
  }
  return { mm: parsed.inches, unit: 'mm' };
}

/** For library data and tests: parse or throw. */
export function len(text: string, defaultUnit: 'in' | 'mm' = 'in'): Length {
  const length = parseLength(text, defaultUnit);
  if (!length) throw new Error(`Not a length: ${text}`);
  return length;
}
