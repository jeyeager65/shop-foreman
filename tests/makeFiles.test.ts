// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { partFaces, cabinetsOf } from '@/design';
import { loadGCodeTools } from '@/gcode/gcodeTools';
import { buildJob } from '@/job/buildJob';
import { buildChecklist } from '@/job/checklist';
import { buildJobZip, filesByBlank, jobZipName } from '@/job/files';
import { crc32 } from '@/jigs/zip';
import type { CabinetDesign, ConstructionStyle, Project } from '@/model';
import { activeMachine, setupFaces } from '@/plan';
import { createBaseCabinetProject } from '@/samples/cabinet';
import { createVanityProject } from '@/samples/vanity';
import { lowRiderJobShop } from './lowRider';

const cabinetOf = (project: Project) => cabinetsOf(project)[0]!;

function jobFor(style: ConstructionStyle, change?: (cabinet: CabinetDesign, project: Project) => void) {
  const shop = lowRiderJobShop();
  const project = createBaseCabinetProject(style);
  change?.(cabinetOf(project), project);
  const job = buildJob(project, shop);
  const all = [...job.parts, ...job.cabinetParts];
  const blankOf = (partId: string) => job.plan.blanks.find((b) => b.partIds.includes(partId))!;
  const programsOf = (partId: string) => job.programs.filter((p) => p.blank.id === blankOf(partId).id);
  return { job, all, shop, project, blankOf, programsOf };
}

/** The names of a stored-only zip's entries with each one's bytes. */
function unzip(bytes: Uint8Array): Record<string, Uint8Array> {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const end = bytes.length - 22;
  expect(view.getUint32(end, true)).toBe(0x06054b50);
  const count = view.getUint16(end + 10, true);
  let at = view.getUint32(end + 16, true);
  const files: Record<string, Uint8Array> = {};
  for (let i = 0; i < count; i++) {
    const crc = view.getUint32(at + 16, true);
    const size = view.getUint32(at + 20, true);
    const nameLength = view.getUint16(at + 28, true);
    const local = view.getUint32(at + 42, true);
    const name = new TextDecoder().decode(bytes.subarray(at + 46, at + 46 + nameLength));
    const start = local + 30 + view.getUint16(local + 26, true) + view.getUint16(local + 28, true);
    const data = bytes.subarray(start, start + size);
    expect(crc32(data)).toBe(crc);
    files[name] = data;
    at += 46 + nameLength;
  }
  return files;
}

describe('the names of a part\'s faces', () => {
  const { all } = jobFor('faceFrame');
  const faces = (id: string) => partFaces(all.find((p) => p.id === id)!);

  it('go by what the part is', () => {
    expect(faces('doors-1/door-left')).toEqual({ A: 'Front', B: 'Back' });
    expect(faces('cabinet-1/side-left')).toEqual({ A: 'Inside', B: 'Outside' });
    expect(faces('cabinet-1/bottom')).toEqual({ A: 'Top', B: 'Underside' });
    expect(faces('cabinet-1/stretcher-front')).toEqual({ A: 'Top', B: 'Underside' });
    expect(faces('drawer-1/box-front')).toEqual({ A: 'Inside', B: 'Outside' });
  });

  it('give a nailer a front and a back, and a flat back stretcher a top', () => {
    expect(faces('cabinet-1/stretcher-back')).toEqual({ A: 'Front', B: 'Back' });
    const flat = jobFor('faceFrame', (cabinet) => {
      cabinet.joinery.backStretcherForm = 'flat';
    });
    expect(partFaces(flat.all.find((p) => p.id === 'cabinet-1/stretcher-back')!)).toEqual({ A: 'Top', B: 'Underside' });
  });
});

describe('face frame cabinet, Kreg pocket holes', () => {
  const { job, all, shop, project, programsOf } = jobFor('faceFrame');

  it('names a one-setup blank\'s file by the blank alone, and a flipped blank\'s by setup and face', () => {
    expect(job.files.map((f) => f.name)).toEqual([
      'base-cabinet-blank-1-setup-1-back.gcode',
      'base-cabinet-blank-1-setup-2-front.gcode',
      'base-cabinet-blank-2.gcode',
      'base-cabinet-blank-3.gcode',
      'base-cabinet-blank-4.gcode',
    ]);
  });

  it('says a side lies inside face up, a box wall too, and a door back then front', () => {
    expect(job.programs.map((p) => p.faces.summary)).toEqual(['back face up', 'front face up', 'inside face up', 'inside face up', 'inside face up']);
    expect(job.programs.every((p) => !p.faces.mixed)).toBe(true);
    const [side] = programsOf('cabinet-1/side-left');
    expect(side!.faces.groups).toEqual([{ face: 'Inside', up: 'inside face up', parts: ['Left side'] }]);
    expect(setupFaces(side!.setup, all)).toEqual(side!.faces);
  });

  it('writes the face into the title, the first message and the checklist', () => {
    const file = job.files[2]!.text;
    expect(file.split('\n')[0]).toBe('(base-cabinet-blank-2.gcode)');
    expect(file).toContain('Blank 2 of 4, setup 1 of 1: inside face up)');
    expect(file).toContain('M0 (MSG, Blank 2 of 4, setup 1 of 1: inside face up. X0 Y0 set here.');
    const steps = buildChecklist(project, job.plan, job.programs, shop.tools, activeMachine(shop));
    expect(steps.some((s) => s.startsWith('Load blank 1 of 4 (3/4" MDF) back face up.'))).toBe(true);
    expect(steps).toContain('Flip the sheet left to right onto the pins, front face up.');
    expect(steps.some((s) => s.startsWith('Load blank 2 of 4 (3/4" Plywood, 1 of 2) inside face up.'))).toBe(true);
    expect(steps.some((s) => s.startsWith('Run base-cabinet-blank-2.gcode: '))).toBe(true);
  });

  it('groups the files under the blank each one cuts', () => {
    const groups = filesByBlank(job);
    expect(groups.map((g) => [g.blank.index, g.files.map((f) => f.index)])).toEqual([
      [1, [0, 1]],
      [2, [2]],
      [3, [3]],
      [4, [4]],
    ]);
    expect(groups[0]!.partNames).toEqual(['Left door', 'Right door', 'Drawer front']);
    expect(groups[1]!.partNames).toEqual(['Left side']);
    expect(groups[3]!.partNames).toHaveLength(4);
    for (const g of groups) {
      for (const f of g.files) {
        expect(f.name).toBe(job.files[f.index]!.name);
        expect(f.program).toBe(job.programs[f.index]);
        expect(f.program.blank.id).toBe(g.blank.id);
      }
    }
  });

  it('zips every file, with whatever else is handed in', () => {
    expect(jobZipName(project.slug)).toBe('base-cabinet-files.zip');
    const kit = new Uint8Array([80, 75, 3, 4, 0, 255]);
    const files = unzip(buildJobZip(job, [{ path: 'base-cabinet-install-kit.3mf', bytes: kit }]));
    expect(Object.keys(files)).toEqual([...job.files.map((f) => f.name), 'base-cabinet-install-kit.3mf']);
    for (const f of job.files) expect(new TextDecoder().decode(files[f.name])).toBe(f.text);
    expect([...files['base-cabinet-install-kit.3mf']!]).toEqual([...kit]);
  });
});

describe('face frame cabinet, CNC-assisted pocket holes', () => {
  const { job, shop, project, programsOf } = jobFor('faceFrame', (_cabinet, p) => {
    p.plan.pocketHoles = 'cncAssisted';
  });
  const [program] = programsOf('cabinet-1/bottom');
  const file = job.files[job.programs.indexOf(program!)]!;

  it('lists the faces of a blank whose parts lie different ways up', () => {
    expect(program!.faces).toEqual({
      summary: 'faces differ',
      mixed: true,
      groups: [
        { face: 'Underside', up: 'underside up', parts: ['Bottom'] },
        { face: 'Top', up: 'top face up', parts: ['Front stretcher'] },
        { face: 'Back', up: 'back face up', parts: ['Back stretcher'] },
      ],
      detail: 'Bottom underside up; Front stretcher top face up; Back stretcher back face up',
    });
  });

  it('says so in the file and the checklist', async () => {
    expect(file.name).toBe('base-cabinet-blank-4.gcode');
    const lines = file.text.split('\n');
    expect(lines.slice(1, 5)).toEqual([
      '(Base cabinet, drawer over doors - Blank 4 of 5, setup 1 of 1: faces differ)',
      '(underside up: Bottom)',
      '(top face up: Front stretcher)',
      '(back face up: Back stretcher)',
    ]);
    expect(lines.every((l) => new TextEncoder().encode(l).length <= 127)).toBe(true);
    const parser = new (loadGCodeTools().GCodeParser)();
    await parser.parseString(file.text);
    expect(parser.events.filter((e) => e.kind === 'alarm')).toEqual([]);
    const steps = buildChecklist(project, job.plan, job.programs, shop.tools, activeMachine(shop));
    expect(
      steps.some((s) =>
        s.startsWith(
          'Load blank 4 of 5 (3/4" Plywood, 3 of 3). Its parts lie different faces up: Bottom underside up; Front stretcher top face up; Back stretcher back face up. Fit the',
        ),
      ),
    ).toBe(true);
  });
});

describe('a hidden side, flipped on pins', () => {
  const { job, programsOf } = jobFor('faceFrame', (cabinet, p) => {
    p.plan.pocketHoles = 'cncAssisted';
    cabinet.sides.left = 'hidden';
  });

  it('is cut outside face up, then inside face up, and its files say so', () => {
    const programs = programsOf('cabinet-1/side-left');
    expect(programs.map((p) => p.faces.summary)).toEqual(['outside face up', 'inside face up']);
    const n = programs[0]!.blank.index;
    expect(programs.map((p) => p.fileName)).toEqual([`base-cabinet-blank-${n}-setup-1-outside.gcode`, `base-cabinet-blank-${n}-setup-2-inside.gcode`]);
    expect(job.files[job.programs.indexOf(programs[0]!)]!.text).toContain(`setup 1 of 2: outside face up`);
  });
});

describe('the vanity job', () => {
  it('keeps its file names and its one group', () => {
    const job = buildJob(createVanityProject(), lowRiderJobShop());
    expect(job.files.map((f) => f.name)).toEqual(['vanity-setup-1-back.gcode', 'vanity-setup-2-front.gcode']);
    expect(job.programs.map((p) => p.faces.summary)).toEqual(['back face up', 'front face up']);
    expect(filesByBlank(job).map((g) => g.files.length)).toEqual([2]);
  });
});
