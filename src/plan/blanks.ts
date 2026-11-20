/**
 * Which pieces of stock the CNC parts are cut from: the parts grouped by material,
 * then nested as rectangles onto as many blanks as they need within the stock size.
 * Each blank gets its own layout, setups and flip.
 *
 * Grain: a sheet's grain is taken to run along its longer side. A part with grain
 * always lies with its grain along the sheet's, which may mean a quarter turn on the
 * blank; it is never turned across it. A part with no grain (MDF) may be turned freely.
 */
import type { Id, MachineProfile, Mm, Operation, Part, PlannedBlank, Project, Shop } from '@/model';
import { nominalText } from '@/units';
import { needsTiling } from './parts';

/** How the layout says its parts do not fit the sheet (`chooseLayout`): never passed on for a part on a blank of its own. */
const SHEET_TOO_SMALL = 'These parts do not fit on one piece of your stock';
import { type BlankLayout, arrangementFor, chooseLayout, needsFlip, planSetups } from './setups';

type Size = { width: Mm; height: Mm };

/** One way of laying a set of parts on one blank. */
interface Fit {
  /** In job order, as designed. */
  parts: Part[];
  /** The same parts as they lie on the blank: a turned one has its width and height swapped. */
  laid: Part[];
  turned: Set<Id>;
  grainAxis?: 'x' | 'y';
  ops: Operation[];
  layout: BlankLayout;
  /** False when even this layout does not fit the stock; the blank then carries the warning. */
  fits: boolean;
}

const turnedCopy = (part: Part): Part => ({ ...part, size: { ...part.size, width: part.size.height, height: part.size.width } });
const area = (part: Part) => part.size.width * part.size.height;

/**
 * The operations that touch these parts. The flip pin holes are among them only when
 * this blank is flipped: a blank with work on one face needs no pins.
 */
export function operationsFor(operations: Operation[], parts: Part[], tiled = false): Operation[] {
  const ids = new Set(parts.map((p) => p.id));
  const own = operations.filter((o) => o.source.kind === 'features' && o.source.refs.some((r) => ids.has(r.partId)));
  // A tiled blank is slid along on pins, as a flipped one is turned over on them.
  return tiled || needsFlip(own, parts) ? [...own, ...operations.filter((o) => o.kind === 'pinHole')] : own;
}

interface Group {
  /** Wooden handles are cut apart from the cabinet's parts: on blanks of their own, even of the same material. */
  handles: boolean;
  materialId: Id;
  thickness: Mm;
  grained: boolean;
  label: string;
  parts: Part[];
}

/** The ways a set of parts may lie on a blank, most wanted first. */
function orientations(parts: Part[], grained: boolean, stock: Size): { turned: Set<Id>; grainAxis?: 'x' | 'y'; stock: Size; fixed: boolean }[] {
  if (grained) {
    const long = Math.max(stock.width, stock.height);
    const short = Math.min(stock.width, stock.height);
    const ids = (test: (p: Part) => boolean) => new Set(parts.filter(test).map((p) => p.id));
    // The sheet's grain along the machine's Y first (a 24 x 48 lies that way), then along X.
    return [
      { turned: ids((p) => p.grain === 'width'), grainAxis: 'y', stock: { width: short, height: long }, fixed: true },
      { turned: ids((p) => p.grain === 'height'), grainAxis: 'x', stock: { width: long, height: short }, fixed: true },
    ];
  }
  const none = { turned: new Set<Id>(), stock, fixed: false };
  const each = parts.map((p) => ({ turned: new Set([p.id]), stock, fixed: false }));
  const all = parts.length > 1 ? [{ turned: new Set(parts.map((p) => p.id)), stock, fixed: false }] : [];
  return [none, ...each, ...all];
}

/**
 * Plans the blanks for the parts the CNC cuts out. `operations` are the job's; each
 * blank's setups take the ones that touch its parts.
 */
export function planBlanks(
  project: Project,
  shop: Shop,
  machine: MachineProfile,
  operations: Operation[],
  parts: Part[],
  stock: Size,
): PlannedBlank[] {
  const order = new Map(parts.map((p, i) => [p.id, i]));
  const inOrder = (list: Part[]) => [...list].sort((a, b) => order.get(a.id)! - order.get(b.id)!);

  const groups: Group[] = [];
  for (const part of parts) {
    const handles = part.role === 'handle';
    let group = groups.find((g) => g.materialId === part.materialId && g.handles === handles);
    if (!group) {
      const material = shop.materials.find((m) => m.id === part.materialId);
      if (!material) throw new Error(`Material not found: ${part.materialId}`);
      group = {
        handles,
        materialId: material.id,
        thickness: material.measuredThickness.mm,
        grained: material.hasGrain,
        label: `${nominalText(material.nominalThickness)} ${material.name}${handles ? ', handles' : ''}`,
        parts: [],
      };
      groups.push(group);
    }
    group.parts.push(part);
  }

  const cutting = { width: machine.cuttingArea.x.mm, height: machine.cuttingArea.y.mm, tileLength: machine.tiling?.maxLength.mm };
  const fitOn = (group: Group, list: Part[], force = false): Fit | null => {
    const set = inOrder(list);
    // One part too long for the cutting area has a blank of its own, cut in two set-ups along Y.
    const tile = set.length === 1 && needsTiling(set[0]!, cutting);
    const ops = operationsFor(operations, set, tile);
    let first: Fit | null = null;
    // Quick no: more part than sheet.
    const tooMuch = set.reduce((sum, p) => sum + area(p), 0) > stock.width * stock.height;
    for (const way of orientations(set, group.grained, stock)) {
      if (tooMuch && !force) break;
      const laid = set.map((p) => (way.turned.has(p.id) ? turnedCopy(p) : p));
      const layout = chooseLayout(ops, laid, group.thickness, machine, way.stock, way.fixed, tile);
      const fits = !layout.warnings.some((w) => w.code === 'stockTooSmall');
      const fit: Fit = { parts: set, laid, turned: way.turned, grainAxis: way.grainAxis, ops, layout, fits };
      if (fits) return fit;
      first ??= fit;
      if (tooMuch) break;
    }
    return force ? first : null;
  };

  /** All on one blank if they fit; otherwise biggest first, each onto the first blank with room. */
  const nest = (group: Group): Fit[] => {
    const whole = fitOn(group, group.parts);
    if (whole) return [whole];
    const bins: Fit[] = [];
    const bySize = [...group.parts].sort((a, b) => area(b) - area(a) || order.get(a.id)! - order.get(b.id)!);
    for (const part of bySize) {
      let placed = false;
      for (let i = 0; i < bins.length && !placed; i++) {
        if (!bins[i]!.fits) continue;
        const grown = fitOn(group, [...bins[i]!.parts, part]);
        if (grown) {
          bins[i] = grown;
          placed = true;
        }
      }
      // A part too big for the sheet gets a blank of its own, as big as it needs: the material is bought to suit,
      // whatever sheet is on hand. Only what the machine cannot cut is said.
      if (!placed) {
        const alone = fitOn(group, [part], true)!;
        bins.push({ ...alone, layout: { ...alone.layout, warnings: alone.layout.warnings.filter((w) => !(w.code === 'stockTooSmall' && w.message.startsWith(SHEET_TOO_SMALL))) } });
      }
    }
    return bins.sort((a, b) => order.get(a.parts[0]!.id)! - order.get(b.parts[0]!.id)!);
  };

  const nested = groups.map((group) => ({ group, fits: nest(group) }));
  const count = nested.reduce((sum, n) => sum + n.fits.length, 0);
  // The user's own piece applies to a job that is one blank; with several, each is the smallest that works.
  const choice = project.plan.blank;
  const own = count === 1 && (choice.width !== undefined || choice.height !== undefined);

  const blanks: PlannedBlank[] = [];
  for (const { group, fits } of nested) {
    fits.forEach((fit, i) => {
      const minimum = fit.layout.blank;
      const size = {
        width: own ? (choice.width?.mm ?? minimum.width) : minimum.width,
        height: own ? (choice.height?.mm ?? minimum.height) : minimum.height,
        thickness: group.thickness,
      };
      const arrangement = own ? arrangementFor(fit.ops, fit.laid, size, machine) : fit.layout.arrangement;
      const planned = planSetups(fit.ops, fit.laid, size, machine, arrangement, fit.turned);
      const index = blanks.length + 1;
      blanks.push({
        id: `blank-${index}`,
        index,
        label: fits.length > 1 ? `${group.label}, ${i + 1} of ${fits.length}` : group.label,
        materialId: group.materialId,
        size,
        minimum,
        arrangement,
        edgeMargin: fit.layout.edgeMargin,
        ...(fit.grainAxis ? { grainAxis: fit.grainAxis } : {}),
        partIds: fit.parts.map((p) => p.id),
        setups: planned.setups,
        // The stock warnings are about the smallest blank, so they don't apply to an entered piece.
        warnings: [...(own ? [] : fit.layout.warnings), ...planned.warnings],
      });
    });
  }
  return blanks;
}
