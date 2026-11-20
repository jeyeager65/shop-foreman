import type { ShelfPin } from '@/model';
import { MM_PER_INCH } from '@/units';

export const GENERIC_SHELF_PIN_ID = 'generic-shelf-pin-5mm';
export const SHELF_PIN_1_4_ID = 'shelf-pin-1-4';

/** Placeholder rows, 32 mm system: 37 mm from the front and from the back, holes 32 mm apart. */
const rows: ShelfPin['rows'] = { frontSetback: 37, rearSetback: 37, spacing: 32 };

export const STARTER_SHELF_PINS: ShelfPin[] = [
  {
    id: GENERIC_SHELF_PIN_ID,
    kind: 'shelfPin',
    name: 'Generic 5 mm shelf pin',
    generic: true,
    hole: { diameter: 5, depth: 10 },
    rows,
    tuneMe: ['hole', 'rows'],
  },
  {
    id: SHELF_PIN_1_4_ID,
    kind: 'shelfPin',
    name: '1/4" shelf pin',
    generic: false,
    hole: { diameter: MM_PER_INCH / 4, depth: (3 * MM_PER_INCH) / 8 },
    rows,
    note: 'The 1/4" bit drills this hole at exactly its own size, so the fit cannot be tuned; a smaller bit can.',
    tuneMe: ['hole', 'rows'],
  },
];
