import type { Caster } from '@/model';
import { len } from '@/units';

export const GENERIC_CASTER_ID = 'generic-caster-3-brake';
export const GENERIC_FOOT_ID = 'generic-foot-4';

/**
 * A bought furniture foot on a mounting plate: it stands where a caster would. Every value
 * tune me. Not among the starter hardware: it is put in the shop profile the first time feet are chosen, so a
 * shop profile saved before it needs nothing done to it.
 */
export const STARTER_FOOT: Caster = {
  id: GENERIC_FOOT_ID,
  kind: 'caster',
  name: 'Generic furniture foot, 4" tall, on a plate',
  generic: true,
  foot: true,
  overallHeight: len('4"'),
  plate: { width: 64, length: 64 },
  holes: { x: 45, y: 45, diameter: 4.5 },
  screw: '#10 × 3/4" pan-head wood screws',
  locking: false,
  load: 60,
  tuneMe: ['overallHeight', 'plate', 'holes', 'load'],
};

/** Plate casters (milestone 9): 3" swivel with and without a brake, and a 4" swivel with a brake. Every value tune me. */
export const STARTER_CASTERS: Caster[] = [
  {
    id: GENERIC_CASTER_ID,
    kind: 'caster',
    name: 'Generic 3" swivel plate caster, with brake',
    generic: true,
    overallHeight: len('4"'),
    plate: { width: 64, length: 89 },
    holes: { x: 45, y: 70, diameter: 4.5 },
    screw: '#12 × 3/4" pan-head wood screws',
    locking: true,
    load: 45,
    tuneMe: ['overallHeight', 'plate', 'holes', 'load'],
  },
  {
    id: 'generic-caster-3',
    kind: 'caster',
    name: 'Generic 3" swivel plate caster',
    generic: true,
    overallHeight: len('4"'),
    plate: { width: 64, length: 89 },
    holes: { x: 45, y: 70, diameter: 4.5 },
    screw: '#12 × 3/4" pan-head wood screws',
    locking: false,
    load: 45,
    tuneMe: ['overallHeight', 'plate', 'holes', 'load'],
  },
  {
    id: 'generic-caster-4-brake',
    kind: 'caster',
    name: 'Generic 4" swivel plate caster, with brake',
    generic: true,
    overallHeight: len('5-1/8"'),
    plate: { width: 76, length: 102 },
    holes: { x: 57, y: 83, diameter: 5 },
    screw: '#14 × 1" pan-head wood screws',
    locking: true,
    load: 90,
    tuneMe: ['overallHeight', 'plate', 'holes', 'load'],
  },
];
