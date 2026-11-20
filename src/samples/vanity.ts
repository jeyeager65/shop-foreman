import { MDF_ID, CABINET_MATERIALS } from '@/libraries';
import type { DesignedCabinetContext, DoorSettings, Project } from '@/model';
import { createBaseCabinetProject, createDrawerSettings, makeExisting } from './cabinet';
import { HINGE_STAND_IN, shownInInches } from '@/design/existing';
import { len } from '@/units';
import { storedCases } from '@/design/settings';

export const VANITY_HINGE_ID = 'blum-compact-38n-1-2-soft-screw';

/**
 * The reference job: two shaker doors on a face frame bathroom vanity. The vanity is a cabinet that is
 * already there (what a refacing project was): its door opening is measured, its
 * inside is not, and only the new doors are made. Its G-code is the golden files'.
 */
export function createVanityProject(): Project {
  const now = '2026-11-11T00:00:00.000Z';
  const doors: DoorSettings = {
    style: {
      kind: 'shaker',
      frameWidth: len('2-1/4"'),
      recessDepth: len('1/4"'),
      insideEdge: { kind: 'vBevel', angleDeg: 60 },
      floorCornerRadius: len('1/16"'),
    },
    outsideEdge: { kind: 'roundover', radius: len('1/8"') },
    materialId: MDF_ID,
    hingeId: VANITY_HINGE_ID,
  };
  const project = createBaseCabinetProject('faceFrame', 'doors');
  const context = project.context as DesignedCabinetContext;
  // How the doors are made: Setup's, and every door set follows it unless made different.
  context.fronts = { doors, drawers: createDrawerSettings(doors) };
  const cabinet = storedCases(context)[0]!;
  cabinet.name = 'Vanity';
  makeExisting(project, cabinet.id, 'new');
  cabinet.existing = {
    frame: 'faceFrame',
    opening: { width: len('20-15/16"'), height: len('23-1/2"') },
    hingeStandIn: shownInInches(HINGE_STAND_IN),
    fronts: 'new',
    // The doors it has now: the overlay they have is worked out from them, and hinges suggested for it.
    doors: { count: 2, widthAcross: len('21-13/16"'), height: len('24-7/8"'), gap: len('1/8"') },
  };
  const openingId = project.designObjects.find((d) => d.template === 'doorSet')!.mounting.openingId;
  return {
    ...project,
    id: 'vanity',
    name: 'Bathroom vanity doors',
    slug: 'vanity',
    createdAt: now,
    updatedAt: now,
    designObjects: [
      {
        id: 'doors-1',
        template: 'doorSet',
        name: 'Vanity doors',
        mounting: {
          openingId,
          type: 'overlay',
          doors: 2,
          gap: len('1/8"'),
          overlayTop: len('11/16"'),
          overlayBottom: len('11/16"'),
        },
      },
    ],
    plan: {
      strategy: 'fastest',
      blank: { materialId: MDF_ID },
      operations: {},
    },
    materials: structuredClone(CABINET_MATERIALS),
    settings: {},
  };
}
