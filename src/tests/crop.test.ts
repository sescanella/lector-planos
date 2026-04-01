import { describe, it, expect } from 'vitest';
import { bboxToPixels, FIXED_CROPS, type CropRegion } from '../services/crop';

// Standard A3 landscape page dimensions in points
const A3_WIDTH_PTS = 1190.55;
const A3_HEIGHT_PTS = 841.89;

describe('bboxToPixels', () => {
  it('converts right_upper region to correct pixel coordinates', () => {
    const region = FIXED_CROPS[0]; // right_upper: 45-100% x, 0-40% y, 600 DPI
    const result = bboxToPixels(region, A3_WIDTH_PTS, A3_HEIGHT_PTS);

    expect(result.x).toBe(Math.round(0.45 * A3_WIDTH_PTS));
    expect(result.y).toBe(0);
    expect(result.width).toBe(Math.round(0.55 * A3_WIDTH_PTS));
    expect(result.height).toBe(Math.round(0.40 * A3_HEIGHT_PTS));
    expect(result.effectiveDpi).toBe(600);
  });

  it('converts cajetin region to correct pixel coordinates', () => {
    const region = FIXED_CROPS[3]; // cajetin: 50-100% x, 80-100% y, 800 DPI
    const result = bboxToPixels(region, A3_WIDTH_PTS, A3_HEIGHT_PTS);

    expect(result.x).toBe(Math.round(0.50 * A3_WIDTH_PTS));
    expect(result.y).toBe(Math.round(0.80 * A3_HEIGHT_PTS));
    expect(result.width).toBe(Math.round(0.50 * A3_WIDTH_PTS));
    expect(result.height).toBe(Math.round(0.20 * A3_HEIGHT_PTS));
    expect(result.effectiveDpi).toBe(800);
  });

  it('converts right_center overlap region correctly', () => {
    const region = FIXED_CROPS[1]; // 45-100% x, 20-60% y
    const result = bboxToPixels(region, A3_WIDTH_PTS, A3_HEIGHT_PTS);

    expect(result.x).toBe(Math.round(0.45 * A3_WIDTH_PTS));
    expect(result.y).toBe(Math.round(0.20 * A3_HEIGHT_PTS));
    expect(result.width).toBe(Math.round(0.55 * A3_WIDTH_PTS));
    expect(result.height).toBe(Math.round(0.40 * A3_HEIGHT_PTS));
  });

  it('produces no negative coordinates for all fixed crops', () => {
    for (const region of FIXED_CROPS) {
      const result = bboxToPixels(region, A3_WIDTH_PTS, A3_HEIGHT_PTS);
      expect(result.x).toBeGreaterThanOrEqual(0);
      expect(result.y).toBeGreaterThanOrEqual(0);
      expect(result.width).toBeGreaterThan(0);
      expect(result.height).toBeGreaterThan(0);
      expect(result.effectiveDpi).toBeGreaterThan(0);
    }
  });

  it('triggers OOM guard when pixel dimension exceeds 8000px', () => {
    const region: CropRegion = {
      id: 'test_oom',
      leftPct: 0,
      topPct: 0,
      rightPct: 100,
      bottomPct: 100,
      dpi: 1200,
    };
    // A1 page: at 1200 DPI full width = 2383.94 * (1200/72) = 39732px
    const result = bboxToPixels(region, 2383.94, 1683.78);

    expect(result.effectiveDpi).toBeLessThan(1200);
    const maxDim = Math.max(
      2383.94 * (result.effectiveDpi / 72),
      1683.78 * (result.effectiveDpi / 72),
    );
    expect(maxDim).toBeLessThanOrEqual(8000);
  });

  it('does not reduce DPI when dimensions are within limits', () => {
    const region: CropRegion = {
      id: 'test_small',
      leftPct: 50,
      topPct: 50,
      rightPct: 100,
      bottomPct: 100,
      dpi: 300,
    };
    const result = bboxToPixels(region, A3_WIDTH_PTS, A3_HEIGHT_PTS);
    expect(result.effectiveDpi).toBe(300);
  });

  it('does not reduce DPI for normal A3 page with fixed crops', () => {
    for (const region of FIXED_CROPS) {
      const result = bboxToPixels(region, A3_WIDTH_PTS, A3_HEIGHT_PTS);
      expect(result.effectiveDpi).toBe(region.dpi);
    }
  });

  it('preserves crop points (not pixels) for poppler coordinates', () => {
    const region: CropRegion = {
      id: 'test_coords',
      leftPct: 25,
      topPct: 30,
      rightPct: 75,
      bottomPct: 80,
      dpi: 400,
    };
    const result = bboxToPixels(region, 1000, 800);

    // Coordinates should be in points for poppler
    expect(result.x).toBe(250);  // 25% of 1000
    expect(result.y).toBe(240);  // 30% of 800
    expect(result.width).toBe(500);  // 50% of 1000
    expect(result.height).toBe(400); // 50% of 800
  });
});

describe('FIXED_CROPS', () => {
  it('has exactly 4 regions', () => {
    expect(FIXED_CROPS).toHaveLength(4);
  });

  it('has correct region IDs in order', () => {
    expect(FIXED_CROPS.map(c => c.id)).toEqual([
      'right_upper',
      'right_center',
      'right_lower',
      'cajetin_titleblk',
    ]);
  });

  it('right_upper and right_center overlap by 20%', () => {
    expect(FIXED_CROPS[0].bottomPct - FIXED_CROPS[1].topPct).toBe(20);
  });

  it('right_center and right_lower overlap', () => {
    expect(FIXED_CROPS[1].bottomPct).toBeGreaterThan(FIXED_CROPS[2].topPct);
  });

  it('cajetin uses higher DPI (800) than table crops (600)', () => {
    expect(FIXED_CROPS[3].dpi).toBe(800);
    expect(FIXED_CROPS[0].dpi).toBe(600);
    expect(FIXED_CROPS[1].dpi).toBe(600);
    expect(FIXED_CROPS[2].dpi).toBe(600);
  });
});
