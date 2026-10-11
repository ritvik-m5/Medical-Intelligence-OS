import { describe, expect, it } from 'vitest';
import { validateAIResponse, type ValidationContext } from './validate';

/* ------------------------------------------------------------------ */
/* Model claim verification                                            */
/*                                                                    */
/* The invariant: a model cannot introduce a number, date, or personal   */
/* fact that is not in the evidence. A general greeting bypasses          */
/* validation entirely.                                                   */
/* ------------------------------------------------------------------ */

const recordContext: ValidationContext = {
  route: 'record',
  asOf: '2026-09-15',
  numbers: [
    { value: 6.6, unit: '%' },
    { value: 45, unit: 'mmol/L' },
    { value: 4.3, unit: 'mmol/L' },
  ],
  dates: ['2026-09-15', '2026-02-18'],
  entities: ['potassium', 'hemoglobin a1c', 'atorvastatin'],
  findings: ['potassium has a value outside the plausible range'],
  sources: [],
  personalStatements: ['potassium 45 mmol/l'],
};

describe('number validation', () => {
  it('accepts a correct value', () => {
    const result = validateAIResponse('Your potassium was 45 mmol/L.', recordContext);
    expect(result.status).toBe('verified');
    expect(result.rejectedClaims).toBe(0);
  });

  it('rejects an incorrect value', () => {
    const result = validateAIResponse('Your potassium was 46 mmol/L.', recordContext);
    expect(result.status).toBe('partially-verified');
    expect(result.claims.some((c) => c.type === 'number' && c.status === 'unsupported')).toBe(true);
  });

  it('accepts a decimal-equivalent value', () => {
    expect(validateAIResponse('Your A1c was 6.60%.', recordContext).status).toBe('verified');
  });

  it('rejects a value the evidence does not contain', () => {
    expect(validateAIResponse('Your A1c was 6.7%.', recordContext).status).toBe('partially-verified');
  });
});

describe('unit validation', () => {
  it('rejects a wrong unit', () => {
    const result = validateAIResponse('Your potassium was 45 mg/dL.', recordContext);
    expect(result.status).toBe('partially-verified');
    expect(result.claims.some((c) => c.type === 'number' && c.status === 'unsupported')).toBe(true);
  });
});

describe('date validation', () => {
  it('accepts equivalent date formats', () => {
    expect(validateAIResponse('Recorded on 09/15/2026.', recordContext).status).toBe('verified');
    expect(validateAIResponse('Recorded on September 15, 2026.', recordContext).status).toBe('verified');
    expect(validateAIResponse('Recorded on 2026-09-15.', recordContext).status).toBe('verified');
  });

  it('rejects a date after asOf', () => {
    const result = validateAIResponse('On 2027-01-01 your potassium was 45.', recordContext);
    expect(result.status).toBe('partially-verified');
    expect(result.claims.some((c) => c.type === 'date' && c.status === 'unsupported')).toBe(true);
  });
});

describe('safe rewrite', () => {
  it('replaces an unsupported diagnosis with a limitation, not a guess', () => {
    const result = validateAIResponse(
      'Your potassium was 45 mmol/L and definitely means you have hyperkalemia.',
      recordContext,
    );
    expect(result.status).toBe('partially-verified');
    // The diagnosis sentence is removed; the supported value survives.
    expect(result.text).toContain('cannot establish');
    expect(result.text).not.toContain('hyperkalemia');
  });
});

describe('general conversation bypasses validation', () => {
  it('returns a greeting unchanged', () => {
    const result = validateAIResponse('Hi! How can I help?', { ...recordContext, route: 'general' });
    expect(result.status).toBe('verified');
    expect(result.text).toBe('Hi! How can I help?');
    expect(result.claims).toEqual([]);
  });

  it('returns a joke unchanged', () => {
    const result = validateAIResponse('Why did the chicken cross the road?', { ...recordContext, route: 'general' });
    expect(result.status).toBe('verified');
    expect(result.claims).toEqual([]);
  });
});

describe('hard invariants', () => {
  it('cannot introduce a new personal number', () => {
    const result = validateAIResponse('Your potassium was 45 and 99 mmol/L.', recordContext);
    expect(result.claims.some((c) => c.type === 'number' && c.status === 'unsupported')).toBe(true);
  });

  it('cannot introduce a new personal fact', () => {
    const result = validateAIResponse('Your record shows you had a stroke in 2020.', recordContext);
    expect(result.status).not.toBe('verified');
  });

  it('a successful, non-empty answer is not automatically verified', () => {
    // Even with real-looking prose, unsupported numbers make it partial.
    const result = validateAIResponse('Your A1c was 9.9%.', recordContext);
    expect(result.status).toBe('partially-verified');
  });
});
