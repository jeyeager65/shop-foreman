import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const dir = resolve(__dirname, '../src/lib/cnc-gcode-tools');
const source = JSON.parse(readFileSync(resolve(dir, 'SOURCE.json'), 'utf8')) as {
  files: Record<string, string>;
};

describe('vendored cnc-gcode-tools', () => {
  it.each(Object.entries(source.files))('%s is unmodified', (name, sha256) => {
    // Hash with LF line endings, as the files are committed.
    const text = readFileSync(resolve(dir, name), 'utf8').replace(/\r\n/g, '\n');
    expect(createHash('sha256').update(text).digest('hex')).toBe(sha256);
  });
});
