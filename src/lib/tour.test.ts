import { describe, it, expect } from 'vitest';
import { tourSteps } from './tour';

const text = (role: Parameters<typeof tourSteps>[0]) => tourSteps(role).map((s) => `${s.title} ${s.body}`).join(' ');

describe('guided tour by role', () => {
  it('parents are not shown head-teacher steps', () => {
    expect(text('parent')).not.toMatch(/Verify payments|Settings|Review results/);
  });
  it('teachers are not shown payment or settings steps', () => {
    expect(text('teacher')).not.toMatch(/Verify payments|bank details|Fee register/);
  });
  it('the head teacher tour covers the administration steps', () => {
    expect(text('admin')).toMatch(/Verify payments/);
    expect(text('admin')).toMatch(/Settings/);
  });
  it('every step opens a real page', () => {
    for (const r of ['admin', 'parent', 'teacher'] as const) {
      for (const st of tourSteps(r)) expect(st.to.startsWith('/')).toBe(true);
    }
  });
  it('gives no steps to a signed-out visitor', () => {
    expect(tourSteps(null)).toHaveLength(0);
  });
});
