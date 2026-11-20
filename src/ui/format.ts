import type { CutMethod, Feature, Method, Operation, Part, PocketHoleMethod, StepTool } from '@/model';

export function duration(seconds: number): string {
  if (seconds <= 0) return 'none';
  const minutes = Math.round(seconds / 60);
  if (minutes < 1) return '< 1 min';
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return h > 0 ? `${h} h ${m} min` : `${m} min`;
}

export const faceLabel = (face: Operation['face']): string =>
  ({ A: 'Front', B: 'Back', edge: 'Edges', install: 'Install' })[face];

export const methodLabel = (method: Method): string =>
  ({ cnc: 'CNC', handheldRouter: 'Handheld router', byHand: 'By hand' })[method];

export const cutMethodLabel = (method: CutMethod): string =>
  ({ cnc: 'CNC', tableSaw: 'Table saw', circularSaw: 'Circular/track saw' })[method];

export const pocketHoleMethodLabel = (method: PocketHoleMethod): string =>
  ({ kregJig: 'Kreg jig', cncAssisted: 'CNC-assisted, 15° (untested)', lowAngle3: 'CNC, low angle 3° (untested)', lowAngle6: 'CNC, low angle 6° (untested)' })[method];

export const stepToolLabel = (tool: StepTool): string =>
  ({ cnc: 'CNC', miterSaw: 'miter saw', jigSaw: 'jig saw', tableSaw: 'table saw', kregJig: 'Kreg jig', byHand: 'by hand' })[tool];

/** Short feature tags for the parts list, e.g. "Back: 2 hinge cups". */
export function featureTags(part: Part, length: (mm: number) => string): string[] {
  const count = (kind: Feature['kind']) => part.features.filter((f) => f.kind === kind).length;
  const tags: string[] = [];
  if (count('pocket')) tags.push('Front: panel pocket');
  for (const f of part.features) {
    if (f.kind === 'bevel') tags.push(`Front: ${f.angleDeg}° inside bevel`);
  }
  if (count('cup')) tags.push(`Back: ${count('cup')} hinge cups`);
  const pulls = part.features.filter((f) => f.kind === 'hole' && f.id.startsWith('finger-pull'));
  const handles = part.features.filter((f) => f.kind === 'hole' && f.id.startsWith('handle'));
  if (count('hole') - pulls.length - handles.length) tags.push(`Back: ${count('hole') - pulls.length - handles.length} dowel holes`);
  if (handles.length) tags.push(`Handle: ${handles.length} ${handles.length === 1 ? 'hole' : 'holes'} through`);
  for (const f of pulls) if (f.kind === 'hole') tags.push(`Finger hole: ${length(f.diameter)} across, through the door`);
  for (const f of part.features) {
    if (f.kind === 'edgeProfile') {
      const t = f.treatment;
      tags.push(`Edges: ${length(t.kind === 'roundover' ? t.radius : t.size)} ${t.kind}`);
    }
  }
  return tags;
}

export function download(name: string, data: string | Uint8Array, type = 'text/plain'): void {
  const url = URL.createObjectURL(new Blob([data as BlobPart], { type }));
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  a.click();
  URL.revokeObjectURL(url);
}
