import { describe, expect, it } from 'vitest';
import { MDF_ID, createStarterShop } from '@/libraries';
import { findTool, finishAllowance } from '@/plan';

describe('finish allowance', () => {
  const tools = createStarterShop().tools;

  it('defaults to 10% of the bit: about 0.3 mm for a 1/8" bit', () => {
    expect(finishAllowance(findTool(tools, 'endmill-1-8'), MDF_ID)).toBeCloseTo(0.3175, 6);
    expect(finishAllowance(findTool(tools, 'endmill-1-4'), MDF_ID)).toBeCloseTo(0.635, 6);
  });

  it("uses the bit's own value when it has one, including 0 for none", () => {
    const bit = structuredClone(findTool(tools, 'endmill-1-4'));
    bit.settings[MDF_ID]!.finishAllowance = 0.4;
    expect(finishAllowance(bit, MDF_ID)).toBe(0.4);
    bit.settings[MDF_ID]!.finishAllowance = 0;
    expect(finishAllowance(bit, MDF_ID)).toBe(0);
  });
});
