/**
 * The textures of the 3D view's realistic look, drawn in code on a canvas (as lr4-sandbox's shop
 * is): no image files to ship or to license. Each tiles, and is near white so the material's own
 * colour (a plywood, a stain) shows through it.
 */
import * as THREE from 'three';

/** A repeatable random number, 0 to 1, so the textures are the same every time. */
function rng(seed: number): () => number {
  let s = seed >>> 0;
  return () => (s = (s * 1664525 + 1013904223) >>> 0) / 4294967296;
}

function canvasTexture(width: number, height: number, draw: (g: CanvasRenderingContext2D, w: number, h: number) => void): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  draw(canvas.getContext('2d')!, width, height);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
  texture.anisotropy = 8;
  return texture;
}

/** The size on a part of one tile of the wood texture, mm: across the grain, and along it. */
export const WOOD_TILE = { across: 420, along: 1400 };

/** How strong the wood grain is drawn: 1 is as first drawn, which was too intense. Tune me. */
export const WOOD_GRAIN_STRENGTH = 0.45;

/** Wood grain, running up the canvas: soft bands of tone, long fine streaks that wander a little, a few pores. */
export function woodTexture(): THREE.CanvasTexture {
  return canvasTexture(512, 1024, (g, w, h) => {
    const r = rng(11);
    const k = WOOD_GRAIN_STRENGTH;
    // A little darker than the palest wood, so the weaker grain leaves the tone about where it was.
    g.fillStyle = '#ece2d2';
    g.fillRect(0, 0, w, h);
    // Broad bands: the boards' and the veneer's changes of tone. Drawn three times across so the tile's edges meet.
    for (let i = 0; i < 26; i++) {
      const x = r() * w;
      const wide = 14 + r() * 60;
      const dark = r() < 0.6;
      g.fillStyle = dark ? `rgba(150,112,70,${k * (0.05 + r() * 0.09)})` : `rgba(255,250,240,${k * (0.08 + r() * 0.12)})`;
      for (const dx of [-w, 0, w]) g.fillRect(x + dx, 0, wide, h);
    }
    // The grain lines: each wanders by a slow wave that closes on itself over the tile's height.
    for (let i = 0; i < 520; i++) {
      const x = r() * w;
      const amp = r() * 5;
      const waves = 1 + Math.floor(r() * 2);
      const phase = r() * Math.PI * 2;
      g.strokeStyle = `rgba(${105 + r() * 40},${72 + r() * 30},${40 + r() * 22},${k * (0.05 + r() * 0.2)})`;
      g.lineWidth = 0.5 + r() * 1.4;
      for (const dx of [-w, 0, w]) {
        g.beginPath();
        for (let y = 0; y <= h; y += 16) {
          const at = x + dx + amp * Math.sin((y / h) * Math.PI * 2 * waves + phase);
          if (y === 0) g.moveTo(at, y);
          else g.lineTo(at, y);
        }
        g.stroke();
      }
    }
    // Pores: short dark flecks along the grain.
    for (let i = 0; i < 2600; i++) {
      g.fillStyle = `rgba(92,62,34,${k * (0.06 + r() * 0.14)})`;
      g.fillRect(r() * w, r() * h, 1, 3 + r() * 9);
    }
  });
}

/**
 * OSB: strands of wood lying every way, pale and dark, pressed flat. Drawn in mm on a tile the
 * wood texture's size, so it lies on a part at its real scale.
 */
export function strandsTexture(): THREE.CanvasTexture {
  return canvasTexture(512, 1024, (g, w, h) => {
    const r = rng(47);
    g.fillStyle = '#e9dcc0';
    g.fillRect(0, 0, w, h);
    g.scale(w / WOOD_TILE.across, h / WOOD_TILE.along);
    const tones = [[246, 236, 212], [232, 216, 184], [214, 194, 156], [250, 242, 224], [198, 174, 134], [238, 224, 194]];
    for (let i = 0; i < 5200; i++) {
      const t = tones[Math.floor(r() * tones.length)]!;
      const [long, wide] = [35 + r() * 70, 8 + r() * 16];
      const turn = r() * Math.PI;
      const [x, y] = [r() * WOOD_TILE.across, r() * WOOD_TILE.along];
      // Drawn again across each edge of the tile, so the tiles meet.
      for (const dx of [-WOOD_TILE.across, 0, WOOD_TILE.across]) {
        for (const dy of [-WOOD_TILE.along, 0, WOOD_TILE.along]) {
          if (x + dx < -long || x + dx > WOOD_TILE.across + long || y + dy < -long || y + dy > WOOD_TILE.along + long) continue;
          g.save();
          g.translate(x + dx, y + dy);
          g.rotate(turn);
          g.fillStyle = `rgba(${t[0]},${t[1]},${t[2]},0.92)`;
          g.fillRect(-long / 2, -wide / 2, long, wide);
          g.strokeStyle = 'rgba(120,88,48,0.35)';
          g.lineWidth = 0.7;
          g.strokeRect(-long / 2, -wide / 2, long, wide);
          g.restore();
        }
      }
    }
  });
}

/** What a window looks out on: sky, paler toward the horizon, and the soft green of a yard below it. */
export function skyTexture(): THREE.CanvasTexture {
  return canvasTexture(64, 256, (g, w, h) => {
    const sky = g.createLinearGradient(0, 0, 0, h);
    sky.addColorStop(0, '#8fc2ee');
    sky.addColorStop(0.62, '#dcecf7');
    sky.addColorStop(0.7, '#a9c79a');
    sky.addColorStop(1, '#6f9a62');
    g.fillStyle = sky;
    g.fillRect(0, 0, w, h);
  });
}

/** The size on the floor of one tile of the floor texture, mm (square). */
export const FLOOR_TILE = 1500;

/** A plank floor: boards running up the canvas, their ends staggered, each its own tone, a dark line between. */
export function floorTexture(): THREE.CanvasTexture {
  return canvasTexture(1024, 1024, (g, w, h) => {
    const r = rng(29);
    const boards = 10;
    const wide = w / boards;
    for (let b = 0; b < boards; b++) {
      // Each strip of boards: two or three boards end to end, the first joint at a random height.
      let y = -r() * h * 0.5;
      while (y < h) {
        const long = h * (0.45 + r() * 0.3);
        const tone = 0.93 + r() * 0.12;
        g.fillStyle = `rgb(${Math.round(150 * tone)},${Math.round(110 * tone)},${Math.round(72 * tone)})`;
        g.fillRect(b * wide, y, wide, long);
        // Its grain.
        for (let i = 0; i < 46; i++) {
          const x = b * wide + r() * wide;
          g.strokeStyle = `rgba(96,64,34,${0.05 + r() * 0.16})`;
          g.lineWidth = 0.6 + r() * 1.2;
          g.beginPath();
          g.moveTo(x, y);
          g.lineTo(x + (r() - 0.5) * 5, y + long);
          g.stroke();
        }
        // The joint at its end.
        g.fillStyle = 'rgba(52,34,18,0.55)';
        g.fillRect(b * wide, y + long - 1, wide, 2);
        y += long;
      }
      g.fillStyle = 'rgba(52,34,18,0.5)';
      g.fillRect(b * wide - 1, 0, 2, h);
    }
  });
}

/**
 * Plywood's edge: its plies, light and dark by turns across the thickness, a dark glue line between.
 * The texture's width is the sheet's thickness; it runs on along the edge.
 */
export function pliesTexture(): THREE.CanvasTexture {
  return canvasTexture(128, 512, (g, w, h) => {
    const r = rng(61);
    const plies = 7;
    for (let i = 0; i < plies; i++) {
      // The face veneers are thin; the plies between share the rest.
      const [x0, x1] = [i === 0 ? 0 : 0.06 + ((i - 1) * 0.88) / (plies - 2), i === plies - 1 ? 1 : 0.06 + (i * 0.88) / (plies - 2)];
      g.fillStyle = i % 2 ? '#c6a273' : '#fbf1dc';
      g.fillRect(x0 * w, 0, (x1 - x0) * w + 1, h);
      g.fillStyle = 'rgba(88,60,30,0.55)';
      g.fillRect(x1 * w - 1, 0, 1.5, h);
    }
    // End grain and saw marks: short flecks across the plies.
    for (let i = 0; i < 1400; i++) {
      g.fillStyle = `rgba(96,66,34,${0.05 + r() * 0.12})`;
      g.fillRect(r() * w, r() * h, 2 + r() * 10, 1);
    }
  });
}

/** OSB's edge: its strands seen end on, in thin pressed layers, darker than its face. */
export function pressedTexture(): THREE.CanvasTexture {
  return canvasTexture(128, 512, (g, w, h) => {
    const r = rng(73);
    g.fillStyle = '#d6c198';
    g.fillRect(0, 0, w, h);
    for (let i = 0; i < 2600; i++) {
      const tone = 150 + r() * 90;
      g.fillStyle = `rgba(${tone},${tone * 0.82},${tone * 0.56},${0.35 + r() * 0.4})`;
      // Thin across the thickness, long along the edge.
      g.fillRect(r() * w, r() * h, 2 + r() * 5, 8 + r() * 46);
    }
    for (let i = 0; i < 500; i++) {
      g.fillStyle = `rgba(70,48,24,${0.15 + r() * 0.25})`;
      g.fillRect(r() * w, r() * h, 1, 4 + r() * 18);
    }
  });
}

/**
 * A solid's mesh made ready for a texture: every triangle its own (so each face can be laid out
 * flat), with a UV for every corner, in tiles of the wood texture, the grain running along the
 * part's grain.
 *
 * The solid's X is across the part's width, Y up its height, Z through its thickness. A face
 * (seen along Z) is laid out by X and Y; an edge by its length and the thickness, the streaks
 * running along the edge. `shift` moves the pattern, so two parts side by side are not alike.
 *
 * Face A (the solid's top, looking along +Z) comes first, then face B, then the edges, as three groups
 * (materials 0, 1 and 2), so a mesh may finish each face as it is finished (a side painted outside and
 * bare inside) and give its edges a material of their own: plywood's plies, OSB's pressed strands. With `thickness`
 * the edges are laid out for that: once across the thickness, whatever it is.
 */
export function withTextureCoordinates(geometry: THREE.BufferGeometry, grain: 'width' | 'height' | undefined, shift: number, thickness?: number): THREE.BufferGeometry {
  const from = geometry.index ? geometry.toNonIndexed() : geometry;
  const p = from.getAttribute('position');
  const faces: number[] = [];
  const backs: number[] = [];
  const edges: number[] = [];
  const [a, b, c, n] = [new THREE.Vector3(), new THREE.Vector3(), new THREE.Vector3(), new THREE.Vector3()];
  for (let i = 0; i + 2 < p.count; i += 3) {
    a.fromBufferAttribute(p, i);
    b.fromBufferAttribute(p, i + 1);
    c.fromBufferAttribute(p, i + 2);
    n.subVectors(b, a).cross(c.sub(a));
    const [nx, ny, nz] = [Math.abs(n.x), Math.abs(n.y), Math.abs(n.z)];
    const axis = nz >= nx && nz >= ny ? 2 : nx >= ny ? 0 : 1;
    const into = axis !== 2 ? edges : n.z >= 0 ? faces : backs;
    for (let k = 0; k < 3; k++) {
      const [x, y, z] = [p.getX(i + k), p.getY(i + k), p.getZ(i + k)];
      // Across the grain, then along it.
      const [across, along] = axis === 2 ? (grain === 'width' ? [y, x] : [x, y]) : axis === 0 ? [z, y] : [z, x];
      const u = axis !== 2 && thickness ? across / thickness : across / WOOD_TILE.across + shift;
      into.push(x, y, z, u, along / WOOD_TILE.along + shift * 1.7);
    }
  }
  const all = [...faces, ...backs, ...edges];
  const count = all.length / 5;
  const position = new Float32Array(count * 3);
  const uv = new Float32Array(count * 2);
  for (let i = 0; i < count; i++) {
    position.set(all.slice(i * 5, i * 5 + 3), i * 3);
    uv.set(all.slice(i * 5 + 3, i * 5 + 5), i * 2);
  }
  if (from !== geometry) from.dispose();
  const flat = new THREE.BufferGeometry();
  flat.setAttribute('position', new THREE.BufferAttribute(position, 3));
  flat.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  flat.addGroup(0, faces.length / 5, 0);
  flat.addGroup(faces.length / 5, backs.length / 5, 1);
  flat.addGroup((faces.length + backs.length) / 5, edges.length / 5, 2);
  return flat;
}

/**
 * A room's floor of a chosen kind, near white so the floor's own colour shows through it:
 * planks as `floorTexture` lays them, square tiles a foot across with grout between, or poured concrete. One
 * tile of the texture is `FLOOR_TILE` square on the floor.
 */
export function floorKindTexture(kind: 'planks' | 'tile' | 'concrete'): THREE.CanvasTexture {
  return canvasTexture(1024, 1024, (g, w, h) => {
    const r = rng(kind === 'planks' ? 31 : kind === 'tile' ? 37 : 41);
    const grey = (v: number, a = 1) => `rgba(${Math.round(v)},${Math.round(v)},${Math.round(v)},${a})`;
    if (kind === 'planks') {
      const boards = 10;
      const wide = w / boards;
      for (let b = 0; b < boards; b++) {
        let y = -r() * h * 0.5;
        while (y < h) {
          const long = h * (0.45 + r() * 0.3);
          g.fillStyle = grey(222 + r() * 30);
          g.fillRect(b * wide, y, wide, long);
          for (let i = 0; i < 40; i++) {
            const x = b * wide + r() * wide;
            g.strokeStyle = grey(120, 0.04 + r() * 0.1);
            g.lineWidth = 0.6 + r() * 1.2;
            g.beginPath();
            g.moveTo(x, y);
            g.lineTo(x + (r() - 0.5) * 5, y + long);
            g.stroke();
          }
          g.fillStyle = grey(70, 0.5);
          g.fillRect(b * wide, y + long - 1, wide, 2);
          y += long;
        }
        g.fillStyle = grey(70, 0.45);
        g.fillRect(b * wide - 1, 0, 2, h);
      }
      return;
    }
    if (kind === 'tile') {
      // Five tiles each way: 300 mm tiles, a grout line between.
      const n = 5;
      const side = w / n;
      for (let i = 0; i < n; i++) {
        for (let j = 0; j < n; j++) {
          g.fillStyle = grey(232 + r() * 20);
          g.fillRect(i * side, j * side, side, side);
        }
      }
      g.fillStyle = grey(150, 0.9);
      for (let i = 0; i < n; i++) {
        g.fillRect(i * side - 2, 0, 4, h);
        g.fillRect(0, i * side - 2, w, 4);
      }
      return;
    }
    g.fillStyle = grey(238);
    g.fillRect(0, 0, w, h);
    for (let i = 0; i < 2600; i++) {
      g.fillStyle = grey(150 + r() * 100, 0.05 + r() * 0.07);
      const d = 4 + r() * 46;
      g.beginPath();
      g.ellipse(r() * w, r() * h, d, d * (0.4 + r() * 0.6), r() * Math.PI, 0, 2 * Math.PI);
      g.fill();
    }
  });
}

/** One repeat of a wall tile's texture on the wall, mm: across and up. */
export const WALL_TILE_REPEAT = { subway: [152.4, 152.4], square: [101.6, 101.6], slab: [600, 600] } as const;

/**
 * Tile on a wall, in its own colours: subway tiles 3" × 6" in a running bond (two courses to a repeat), 4" squares,
 * or a plain slab with no joints.
 */
export function wallTileTexture(look: 'subway' | 'square' | 'slab', color: string, grout: string): THREE.CanvasTexture {
  return canvasTexture(256, 256, (g, w, h) => {
    g.fillStyle = look === 'slab' ? color : grout;
    g.fillRect(0, 0, w, h);
    if (look === 'slab') return;
    const joint = look === 'subway' ? 5 : 7;
    g.fillStyle = color;
    if (look === 'square') g.fillRect(joint / 2, joint / 2, w - joint, h - joint);
    else {
      // The lower course: one whole tile. The upper: two halves, the joint in the middle of the tile below.
      g.fillRect(joint / 2, h / 2 + joint / 2, w - joint, h / 2 - joint);
      g.fillRect(-w / 2 + joint / 2, joint / 2, w - joint, h / 2 - joint);
      g.fillRect(w / 2 + joint / 2, joint / 2, w - joint, h / 2 - joint);
    }
  });
}
