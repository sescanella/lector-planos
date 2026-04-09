import { matchFamily } from '../services/classify';

describe('matchFamily', () => {
  it('detects spool from TAG SPOOL keyword', () => {
    const result = matchFamily('SOME TEXT TAG SPOOL: MK-1414 MORE TEXT');
    expect(result.family).toBe('spool');
    expect(result.confidence).toBe(0.95);
    expect(result.keywords).toContain('TAG SPOOL');
  });

  it('detects isometric from NUMERO ISOMETRICO', () => {
    const result = matchFamily('REFERENCIA P&ID NUMERO NUMERO ISOMETRICO\n1002-03-ID-EPC-002');
    expect(result.family).toBe('isometric');
    expect(result.confidence).toBe(0.95);
    expect(result.keywords).toContain('NUMERO ISOMETRICO');
  });

  it('detects isometric from FORMATO ISOMETRICO', () => {
    const result = matchFamily('FORMATO ISOMETRICO\nEMITIDO PARA CONSTRUCCION');
    expect(result.family).toBe('isometric');
    expect(result.keywords).toContain('FORMATO ISOMETRICO');
  });

  it('does NOT detect isometric from standalone ISOMETRICO (field label in spool drawings)', () => {
    const result = matchFamily('ISOMETRICO: 1002-03-ID-EPC');
    expect(result.family).toBe('unknown');
  });

  it('returns unknown when both families match', () => {
    const result = matchFamily('TAG SPOOL: MK-123 NUMERO ISOMETRICO 456');
    expect(result.family).toBe('unknown');
    expect(result.confidence).toBe(0.3);
    expect(result.keywords.length).toBeGreaterThan(0);
  });

  it('returns unknown when no keywords match', () => {
    const result = matchFamily('RANDOM TEXT WITH NO RELEVANT KEYWORDS');
    expect(result.family).toBe('unknown');
    expect(result.confidence).toBe(0);
    expect(result.keywords).toEqual([]);
  });

  it('is case insensitive', () => {
    const result = matchFamily('tag spool: mk-1414');
    expect(result.family).toBe('spool');
  });

  it('handles empty string', () => {
    const result = matchFamily('');
    expect(result.family).toBe('unknown');
    expect(result.confidence).toBe(0);
  });

  it('handles noisy OCR output with TAG SPOOL', () => {
    const result = matchFamily('TUVL VS ONO NIN\nTAG SPOOL:\nMK—1414—PW—13774—002—R');
    expect(result.family).toBe('spool');
  });

  it('handles noisy OCR output with NUMERO ISOMETRICO', () => {
    const result = matchFamily('IICONTRATO [INUMERO DE LINEA\nJREFERENCIA P&ID NUMERO NUMERO ISOMETRICO');
    expect(result.family).toBe('isometric');
  });

  it('does NOT false-positive on spool drawing with ISOMETRICO field label', () => {
    const result = matchFamily('TUVL VS ONO NIN\nISOMETRICO: Rev.\n1002-03\nTAG SPOOL:\nMK-1414');
    expect(result.family).toBe('spool');
  });
});
