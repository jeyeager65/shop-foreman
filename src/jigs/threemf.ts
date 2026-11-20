/** Writes solids as a 3MF package (core spec, millimetres). */
import type { SolidMesh } from '@/geometry/solids';
import type { Mm } from '@/model';
import { zip } from './zip';

export interface PrintObject {
  name: string;
  mesh: SolidMesh;
  /** Where each copy sits on the print bed (the mesh's own origin moved to x, y). */
  placements: { x: Mm; y: Mm }[];
}

const n = (value: number) => String(Number(value.toFixed(4)));
const attr = (text: string) => text.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');

export function modelXml(objects: PrintObject[]): string {
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
 <Default Extension="model" ContentType="application/vnd.ms-package.3dmanufacturing-3dmodel+xml"/>
</Types>
`;

const RELS = `<?xml version="1.0" encoding="UTF-8"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
 <Relationship Target="/3D/3dmodel.model" Id="rel0" Type="http://schemas.microsoft.com/3dmanufacturing/2013/01/3dmodel"/>
</Relationships>
`;

export function write3mf(objects: PrintObject[]): Uint8Array {
  return zip([
    { path: '[Content_Types].xml', text: CONTENT_TYPES },
    { path: '_rels/.rels', text: RELS },
    { path: '3D/3dmodel.model', text: modelXml(objects) },
  ]);
}
