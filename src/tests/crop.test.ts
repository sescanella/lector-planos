import { bboxToPixels, FIXED_CROPS, type CropRegion } from '../services/crop';

// Standard A3 landscape page dimensions in points
const A3_WIDTH_PTS = 1190.55;
const A3_HEIGHT_PTS = 841.89;

describe('bboxToPixels', () => {
  it('converts right_upper region to correct pixel coordinates', () => {
    const region = FIXED_CROPS[0]; // right_upper: 45-100% x, 0-40% y, 600 DPI
    const scale = 600 / 72;
    const result = bboxToPixels(region, A3_WIDTH_PTS, A3_HEIGHT_PTS);

    expect(result.x).toBe(Math.round(0.45 * A3_WIDTH_PTS * scale));
    expect(result.y).toBe(0);
    expect(result.width).toBe(Math.round(0.55 * A3_WIDTH_PTS * scale));
    expect(result.height).toBe(Math.round(0.40 * A3_HEIGHT_PTS * scale));
    expect(result.effectiveDpi).toBe(600);
  });

  it('converts cajetin region to correct pixel coordinates', () => {
    const region = FIXED_CROPS[3]; // cajetin: 50-100% x, 80-100% y, 800 DPI
    const scale = 800 / 72;
    const result = bboxToPixels(region, A3_WIDTH_PTS, A3_HEIGHT_PTS);

    expect(result.x).toBe(Math.round(0.50 * A3_WIDTH_PTS * scale));
    expect(result.y).toBe(Math.round(0.80 * A3_HEIGHT_PTS * scale));
    expect(result.width).toBe(Math.round(0.50 * A3_WIDTH_PTS * scale));
    expect(result.height).toBe(Math.round(0.20 * A3_HEIGHT_PTS * scale));
    expect(result.effectiveDpi).toBe(800);
  });

  it('converts right_center overlap region correctly', () => {
    const region = FIXED_CROPS[1]; // 45-100% x, 20-60% y, 600 DPI
    const scale = 600 / 72;
    const result = bboxToPixels(region, A3_WIDTH_PTS, A3_HEIGHT_PTS);

    expect(result.x).toBe(Math.round(0.45 * A3_WIDTH_PTS * scale));
    expect(result.y).toBe(Math.round(0.20 * A3_HEIGHT_PTS * scale));
    expect(result.width).toBe(Math.round(0.55 * A3_WIDTH_PTS * scale));
    expect(result.height).toBe(Math.round(0.40 * A3_HEIGHT_PTS * scale));
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

  it('computes pixel coordinates using (pct/100) * pts * (dpi/72) formula', () => {
    const region: CropRegion = {
      id: 'test_coords',
      leftPct: 25,
      topPct: 30,
      rightPct: 75,
      bottomPct: 80,
      dpi: 400,
    };
    const result = bboxToPixels(region, 1000, 800);
    const scale = 400 / 72;

    // Coordinates must be in pixels at target DPI
    expect(result.x).toBe(Math.round(250 * scale));   // 25% of 1000 * scale
    expect(result.y).toBe(Math.round(240 * scale));    // 30% of 800 * scale
    expect(result.width).toBe(Math.round(500 * scale));  // 50% of 1000 * scale
    expect(result.height).toBe(Math.round(400 * scale)); // 50% of 800 * scale
  });
});

describe('bboxToPixels edge cases', () => {
  it('should handle very small crop region', () => {
    const region: CropRegion = { id: 'tiny', leftPct: 49, topPct: 49, rightPct: 51, bottomPct: 51, dpi: 600 };
    const result = bboxToPixels(region, 841.89, 595.28);
    expect(result.width).toBeGreaterThan(0);
    expect(result.height).toBeGreaterThan(0);
  });

  it('should handle full-page crop region', () => {
    const region: CropRegion = { id: 'full', leftPct: 0, topPct: 0, rightPct: 100, bottomPct: 100, dpi: 300 };
    const result = bboxToPixels(region, 841.89, 595.28);
    expect(result.x).toBe(0);
    expect(result.y).toBe(0);
  });

  it('should trigger OOM guard for very high DPI on large page', () => {
    const region: CropRegion = { id: 'huge', leftPct: 0, topPct: 0, rightPct: 100, bottomPct: 100, dpi: 1200 };
    const result = bboxToPixels(region, 2383.94, 1683.78); // A1 in points
    expect(result.effectiveDpi).toBeLessThan(1200);
  });

  it('should not reduce DPI when dimensions are within limit', () => {
    const region: CropRegion = { id: 'ok', leftPct: 45, topPct: 0, rightPct: 100, bottomPct: 40, dpi: 600 };
    const result = bboxToPixels(region, 841.89, 595.28);
    expect(result.effectiveDpi).toBe(600);
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
