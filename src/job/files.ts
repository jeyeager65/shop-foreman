import { type ZipEntry, zip } from '@/jigs/zip';
import type { PlannedBlank, SetupProgram } from '@/model';
import type { Job } from './buildJob';

export interface BlankFile {
  /** Its position in `job.files` and `job.programs`. */
  index: number;
  name: string;
  text: string;
  program: SetupProgram;
}

/** A blank with the files that cut it, one per setup. */
export interface BlankFiles {
  blank: PlannedBlank;
  /** The parts on the blank, by name, in layout order. */
  partNames: string[];
  files: BlankFile[];
}

/** The job's G-code files under the blank each one cuts, in job order. A blank with nothing to cut is left out. */
export function filesByBlank(job: Job): BlankFiles[] {
  const all = [...job.parts, ...job.cabinetParts];
  return job.plan.blanks.flatMap((blank) => {
    const files = job.programs.flatMap((program, index) =>
      program.blank.id === blank.id ? [{ index, name: job.files[index]!.name, text: job.files[index]!.text, program }] : [],
    );
    if (files.length === 0) return [];
    return [{ blank, partNames: blank.partIds.map((id) => all.find((p) => p.id === id)?.name ?? id), files }];
  });
}

export const jobZipName = (slug: string) => `${slug}-files.zip`;

/** Every G-code file of the job, and whatever else goes with it (the install kit), in one ZIP. */
export function buildJobZip(job: Job, extras: ZipEntry[] = []): Uint8Array {
  return zip([...job.files.map((f) => ({ path: f.name, text: f.text })), ...extras]);
}
