/**
 * Writes solids as a 3MF package (core spec, millimetres). A solid may say how it should be printed: that goes in
 * a part of the package that Bambu Studio and OrcaSlicer read as the object's own settings when the file is opened
 * (not when it is imported into a plate), and that any other program skips. Nothing names a printer or a filament.
 */
import type { SolidMesh } from '@/geometry/solids';
import type { Mm } from '@/model';
import { zip } from './zip';

/** How a solid should be sliced, where it matters to how it works. */
export interface PrintSettings {
  /** Walls round every outline. */
  walls: number;
  /** Solid layers at its top and at its bottom. */
  topLayers: number;
  bottomLayers: number;
  /** How full the inside is, in percent, and in what pattern. */
  infillPercent: number;
  infillPattern: 'gyroid' | 'cubic' | 'grid';
  layerHeight: Mm;
}

/** The settings in words, for a page's notes. */
export const printSettingsWords = (s: PrintSettings): string =>
  `${s.walls} walls, ${s.topLayers} top and ${s.bottomLayers} bottom layers, ${s.infillPercent}% ${s.infillPattern} infill, ${s.layerHeight} mm layers`;

export interface PrintObject {
  name: string;
  mesh: SolidMesh;
  /** Where each copy sits on the print bed (the mesh's own origin moved to x, y). */
  placements: { x: Mm; y: Mm }[];
  /** How it is drawn on the page, when not as a printed solid: its colour, and see-through below 1. Not written to the file. */
  look?: { color: number; opacity?: number };
  /** How to slice it, written into the file for the slicers that read it. Left out: as the slicer is set. */
  print?: PrintSettings;
}

/**
 * The objects as the file has them. One with settings of its own that is on the bed more than once is an object
 * for each copy: a slicer splits a shared object into copies before it gives it its settings, and only the first
 * would get them.
 */
const written = (objects: PrintObject[]): PrintObject[] =>
  objects.flatMap((object) => (object.print && object.placements.length > 1 ? object.placements.map((p) => ({ ...object, placements: [p] })) : [object]));

/**
 * The objects' own settings as Bambu Studio and OrcaSlicer keep them: an entry for each object, by its number in
 * the model. Undefined when no object has any.
 */
export function slicerSettingsXml(objects: PrintObject[]): string | undefined {
  const all = written(objects);
  if (!all.some((o) => o.print)) return undefined;
  const out = ['<?xml version="1.0" encoding="UTF-8"?>', '<config>'];
  all.forEach((object, i) => {
    const s = object.print;
    if (!s) return;
    const values: [string, string][] = [
      ['name', object.name],
      ['wall_loops', String(s.walls)],
      ['top_shell_layers', String(s.topLayers)],
      ['bottom_shell_layers', String(s.bottomLayers)],
      ['sparse_infill_density', `${s.infillPercent}%`],
      ['sparse_infill_pattern', s.infillPattern],
      ['layer_height', String(s.layerHeight)],
    ];
    out.push(` <object id="${i + 1}">`, ...values.map(([key, value]) => `  <metadata key="${key}" value="${attr(value)}"/>`), ' </object>');
  });
  out.push('</config>', '');
  return out.join('\n');
}

const n = (value: number) => String(Number(value.toFixed(4)));
const attr = (text: string) => text.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');

export function modelXml(given: PrintObject[]): string {
  const objects = written(given);
  const out = [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<model unit="millimeter" xml:lang="en-US" xmlns="http://schemas.microsoft.com/3dmanufacturing/core/2015/02">',
    ' <resources>',
  ];
  objects.forEach((object, i) => {
    const { positions, triangles } = object.mesh;
    out.push(`  <object id="${i + 1}" type="model" name="${attr(object.name)}">`, '   <mesh>', '    <vertices>');
    for (let v = 0; v < positions.length; v += 3) {
      out.push(`     <vertex x="${n(positions[v]!)}" y="${n(positions[v + 1]!)}" z="${n(positions[v + 2]!)}"/>`);
    }
    out.push('    </vertices>', '    <triangles>');
    for (let t = 0; t < triangles.length; t += 3) {
      out.push(`     <triangle v1="${triangles[t]}" v2="${triangles[t + 1]}" v3="${triangles[t + 2]}"/>`);
    }
    out.push('    </triangles>', '   </mesh>', '  </object>');
  });
  out.push(' </resources>', ' <build>');
  objects.forEach((object, i) => {
    for (const p of object.placements) {
      out.push(`  <item objectid="${i + 1}" transform="1 0 0 0 1 0 0 0 1 ${n(p.x)} ${n(p.y)} 0"/>`);
    }
  });
  out.push(' </build>', '</model>', '');
  return out.join('\n');
}

const CONTENT_TYPES = `<?xml version="1.0" encoding="UTF-8"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
 <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
 <Default Extension="model" ContentType="application/vnd.ms-package.3dmanufacturing-3dmodel+xml"/>%CONFIG%
</Types>
`;

const RELS = `<?xml version="1.0" encoding="UTF-8"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
 <Relationship Target="/3D/3dmodel.model" Id="rel0" Type="http://schemas.microsoft.com/3dmanufacturing/2013/01/3dmodel"/>
</Relationships>
`;

export function write3mf(objects: PrintObject[]): Uint8Array {
  const settings = slicerSettingsXml(objects);
  return zip([
    { path: '[Content_Types].xml', text: CONTENT_TYPES.replace('%CONFIG%', settings ? '\n <Default Extension="config" ContentType="text/xml"/>' : '') },
    { path: '_rels/.rels', text: RELS },
    { path: '3D/3dmodel.model', text: modelXml(objects) },
    ...(settings ? [{ path: 'Metadata/model_settings.config', text: settings }] : []),
  ]);
}
