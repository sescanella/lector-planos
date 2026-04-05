import { describe, it, expect } from 'vitest';
import { getConfidenceLevel, getConfidenceColor, isLowConfidence, formatFileSize, formatDate } from '@/lib/utils';

describe('getConfidenceLevel', () => {
  it('returns alta for >= 0.85', () => {
    expect(getConfidenceLevel(0.85)).toBe('alta');
    expect(getConfidenceLevel(0.99)).toBe('alta');
    expect(getConfidenceLevel(1.0)).toBe('alta');
  });

  it('returns media for 0.60-0.84', () => {
    expect(getConfidenceLevel(0.60)).toBe('media');
    expect(getConfidenceLevel(0.75)).toBe('media');
    expect(getConfidenceLevel(0.84)).toBe('media');
  });

  it('returns baja for < 0.60', () => {
    expect(getConfidenceLevel(0.59)).toBe('baja');
    expect(getConfidenceLevel(0.0)).toBe('baja');
    expect(getConfidenceLevel(0.30)).toBe('baja');
  });
});

describe('getConfidenceColor', () => {
  it('returns success class for alta', () => {
    expect(getConfidenceColor(0.90)).toContain('bg-success');
  });

  it('returns warning class for media', () => {
    expect(getConfidenceColor(0.70)).toContain('bg-warning');
  });

  it('returns error class for baja', () => {
    expect(getConfidenceColor(0.40)).toContain('bg-error');
  });
});

describe('isLowConfidence', () => {
  it('returns true for < 0.60', () => {
    expect(isLowConfidence(0.59)).toBe(true);
    expect(isLowConfidence(0.0)).toBe(true);
  });

  it('returns false for >= 0.60', () => {
    expect(isLowConfidence(0.60)).toBe(false);
    expect(isLowConfidence(0.85)).toBe(false);
  });
});

describe('formatFileSize', () => {
  it('formats bytes', () => {
    expect(formatFileSize(500)).toBe('500 B');
  });

  it('formats KB', () => {
    expect(formatFileSize(2048)).toBe('2.0 KB');
  });

  it('formats MB', () => {
    expect(formatFileSize(5 * 1024 * 1024)).toBe('5.0 MB');
  });
});

describe('formatDate', () => {
  it('formats ISO date to Spanish locale', () => {
    const result = formatDate('2026-04-02T10:30:00.000Z');
    expect(result).toMatch(/\d{2}\/\d{2}\/\d{4}/);
  });
});
