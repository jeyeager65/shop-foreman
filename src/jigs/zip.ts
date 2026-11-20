/**
 * A minimal ZIP writer (stored, no compression), enough for a 3MF package and for
 * a job's files in one download.
 * Timestamps are fixed so the same input always gives the same bytes.
 */
const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c >>> 0;
  }
  return table;
})();

export function crc32(bytes: Uint8Array): number {
  let c = 0xffffffff;
  for (const b of bytes) c = CRC_TABLE[(c ^ b) & 0xff]! ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

const DOS_DATE = (1 << 5) | 1; // 1 Jan 1980

export type ZipEntry = { path: string; text: string } | { path: string; bytes: Uint8Array };

export function zip(files: ZipEntry[]): Uint8Array {
  const encoder = new TextEncoder();
  const entries = files.map((f) => {
    const data = 'bytes' in f ? f.bytes : encoder.encode(f.text);
    return { name: encoder.encode(f.path), data, crc: crc32(data), offset: 0 };
  });
  const size =
    entries.reduce((sum, e) => sum + 30 + e.name.length + e.data.length + 46 + e.name.length, 0) + 22;
  const out = new Uint8Array(size);
  const view = new DataView(out.buffer);
  let at = 0;
  const u16 = (v: number) => (view.setUint16(at, v, true), (at += 2));
  const u32 = (v: number) => (view.setUint32(at, v, true), (at += 4));
  const raw = (bytes: Uint8Array) => (out.set(bytes, at), (at += bytes.length));
  /** The fields the local header and the central directory share. */
  const common = (e: (typeof entries)[number]) => {
    u16(20); // version needed
    u16(0x0800); // names are UTF-8
    u16(0); // stored
    u16(0); // time
    u16(DOS_DATE);
    u32(e.crc);
    u32(e.data.length);
    u32(e.data.length);
    u16(e.name.length);
    u16(0); // extra length
  };

  for (const e of entries) {
    e.offset = at;
    u32(0x04034b50);
    common(e);
    raw(e.name);
    raw(e.data);
  }
  const directory = at;
  for (const e of entries) {
    u32(0x02014b50);
    u16(20); // version made by
    common(e);
    u16(0); // comment length
    u16(0); // disk
    u16(0); // internal attributes
    u32(0); // external attributes
    u32(e.offset);
    raw(e.name);
  }
  const directorySize = at - directory;
  u32(0x06054b50);
  u16(0);
  u16(0);
  u16(entries.length);
  u16(entries.length);
  u32(directorySize);
  u32(directory);
  u16(0);
  return out;
}
