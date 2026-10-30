import { describe, it, expect } from 'vitest';
import { greetingFor } from './greeting';

describe('time-of-day greeting', () => {
  it('uses morning until 11:59', () => {
    expect(greetingFor(0)).toBe('Good morning');
    expect(greetingFor(11)).toBe('Good morning');
  });
  it('uses afternoon from 12:00 to 16:59', () => {
    expect(greetingFor(12)).toBe('Good afternoon');
    expect(greetingFor(16)).toBe('Good afternoon');
  });
  it('uses evening from 17:00', () => {
    expect(greetingFor(17)).toBe('Good evening');
    expect(greetingFor(23)).toBe('Good evening');
  });
});
