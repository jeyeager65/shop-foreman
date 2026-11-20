// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { cabinetsOf, deriveCabinetOpenings, designsOf } from '@/design';
import { buildJob } from '@/job/buildJob';
import { createStarterShop } from '@/libraries';
import type { CasesContext } from '@/model';
import { createBaseCabinetProject, makeBlind, setBays } from '@/samples/cabinet';
import { len } from '@/units';

/** A blind corner made from an ordinary cabinet (Design's Corner select, `&corner=1:blind-left`). */
describe('making a blind corner cabinet', () => {
  it('widens a 24" cabinet to 42", one door hinged away from the blind, and it derives', () => {
    const project = createBaseCabinetProject('frameless');
    const id = cabinetsOf(project)[0]!.id;
    makeBlind(project, id, 'left');
    const cabinet = cabinetsOf(project)[0]!;
    expect(cabinet.size.width.mm).toBeCloseTo(len('42"').mm, 6);
    const doors = designsOf(project).filter((d) => d.template === 'doorSet');
    expect(doors.every((d) => d.template === 'doorSet' && d.mounting.doors === 1 && d.mounting.hingeSide === 'right')).toBe(true);
    expect(deriveCabinetOpenings(cabinet, project.materials).every((o) => o.width > 0)).toBe(true);
    expect(() => buildJob(project, createStarterShop())).not.toThrow();
  });

  it('leaves a cabinet wide enough alone, and only turns the blind to the other side after', () => {
    const project = createBaseCabinetProject('frameless');
    const stored = (project.context as CasesContext).pieces[0]!;
    stored.size.width = len('48"');
    setBays(project, cabinetsOf(project)[0]!, 2);
    makeBlind(project, stored.id, 'right');
    expect(stored.size.width.mm).toBeCloseTo(len('48"').mm, 6);
    // A corner cabinet has no bays.
    expect(cabinetsOf(project)[0]!.layout.bays?.length ?? 1).toBe(1);
    makeBlind(project, stored.id, 'left');
    expect(stored.corner).toMatchObject({ kind: 'blind', side: 'left' });
  });

  it('mends a blind corner already too narrow (a project saved before this)', () => {
    const project = createBaseCabinetProject('frameless');
    const stored = (project.context as CasesContext).pieces[0]!;
    stored.corner = { kind: 'blind', side: 'left', blind: len('26-1/2"'), filler: len('3"') };
    makeBlind(project, stored.id, 'left');
    expect(stored.size.width.mm).toBeCloseTo(len('42"').mm, 6);
  });

  it('a blind too wide for its cabinet says so plainly', () => {
    const project = createBaseCabinetProject('frameless');
    const stored = (project.context as CasesContext).pieces[0]!;
    stored.corner = { kind: 'blind', side: 'left', blind: len('26-1/2"'), filler: len('3"') };
    expect(() => deriveCabinetOpenings(cabinetsOf(project)[0]!, project.materials)).toThrow(/too narrow for its blind corner/);
  });
});
