/**
 * A few printable solids as a three.js scene: for the picture of a jig or a handle on the page that
 * lists them (`#/jigs`). The solids lie on the print bed as their file has them (X and Y on the bed,
 * Z up); the scene turns that up for three.js (Y up).
 */
import * as THREE from 'three';
import type { PrintObject } from '@/jigs/threemf';

/** The bed's colour and the solids'. */
const SOLID = 0xd8a868;
const BED = 0x2b3038;

/** The solids, each copy where its placement puts it, standing on a bed a little bigger than they are. */
export function buildMeshScene(objects: PrintObject[]): { scene: THREE.Scene; size: THREE.Vector3; centre: THREE.Vector3; dispose(): void } {
  const scene = new THREE.Scene();
  const group = new THREE.Group();
  // The bed's X, Y, Z become three's X, -Z, Y: turned a quarter about X.
  group.rotation.x = -Math.PI / 2;
  const made: { dispose(): void }[] = [];
  const material = new THREE.MeshStandardMaterial({ color: SOLID, roughness: 0.75, metalness: 0 });
  made.push(material);
  for (const object of objects) {
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(object.mesh.positions, 3));
    geometry.setIndex(new THREE.BufferAttribute(object.mesh.triangles, 1));
    // Flat faces: every triangle its own normal, so edges read.
    const flat = geometry.toNonIndexed();
    flat.computeVertexNormals();
    geometry.dispose();
    made.push(flat);
    for (const p of object.placements) {
      const mesh = new THREE.Mesh(flat, material);
      mesh.position.set(p.x, p.y, 0);
      group.add(mesh);
    }
  }
  scene.add(group);
  const box = new THREE.Box3().setFromObject(group);
  const size = box.isEmpty() ? new THREE.Vector3(1, 1, 1) : box.getSize(new THREE.Vector3());
  const centre = box.isEmpty() ? new THREE.Vector3() : box.getCenter(new THREE.Vector3());
  if (!box.isEmpty()) {
    const margin = Math.max(size.x, size.z) * 0.25 + 5;
    const bedGeometry = new THREE.PlaneGeometry(size.x + 2 * margin, size.z + 2 * margin);
    const bedMaterial = new THREE.MeshStandardMaterial({ color: BED, roughness: 1 });
    const bed = new THREE.Mesh(bedGeometry, bedMaterial);
    bed.rotation.x = -Math.PI / 2;
    bed.position.set(centre.x, box.min.y - 0.02, centre.z);
    scene.add(bed);
    made.push(bedGeometry, bedMaterial);
  }
  scene.add(new THREE.HemisphereLight(0xffffff, 0x4a4f58, 1.5));
  const sun = new THREE.DirectionalLight(0xffffff, 1.9);
  sun.position.set(centre.x - size.x, centre.y + Math.max(size.x, size.y, size.z) * 2, centre.z + size.z * 1.5 + 10);
  scene.add(sun);
  return { scene, size, centre, dispose: () => made.forEach((m) => m.dispose()) };
}

/** A camera that looks at the solids from the front, above and a little to one side, with all of them in view. */
export function frameCamera(camera: THREE.PerspectiveCamera, size: THREE.Vector3, centre: THREE.Vector3): void {
  const radius = Math.max(1, size.length() / 2);
  const distance = (radius / Math.sin(THREE.MathUtils.degToRad(camera.fov) / 2)) * 1.05;
  const from = new THREE.Vector3(-0.55, 0.75, 1).normalize().multiplyScalar(distance);
  camera.position.copy(centre).add(from);
  camera.near = distance / 100;
  camera.far = distance * 10;
  camera.lookAt(centre);
  camera.updateProjectionMatrix();
}

let shared: THREE.WebGLRenderer | undefined | null;

/**
 * A small picture of the solids, as a data URL, drawn by one renderer shared by every picture (a page
 * of a dozen items must not open a dozen WebGL contexts). Undefined where WebGL is not to be had.
 */
export function meshPicture(objects: PrintObject[], width = 320, height = 200): string | undefined {
  if (objects.length === 0 || shared === null) return undefined;
  try {
    shared ??= new THREE.WebGLRenderer({ antialias: true, alpha: true, preserveDrawingBuffer: true });
  } catch {
    shared = null;
    return undefined;
  }
  const built = buildMeshScene(objects);
  try {
    shared.setPixelRatio(1);
    shared.setSize(width, height, false);
    const camera = new THREE.PerspectiveCamera(35, width / height, 1, 1000);
    frameCamera(camera, built.size, built.centre);
    shared.render(built.scene, camera);
    return shared.domElement.toDataURL('image/webp', 0.85);
  } catch {
    return undefined;
  } finally {
    built.dispose();
  }
}
