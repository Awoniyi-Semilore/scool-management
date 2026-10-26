import { describe, it, expect } from 'vitest';
import { nairaInWordsFromKobo, numberToWords } from './words';

describe('amount in words for receipts', () => {
  it('writes whole naira amounts', () => {
    expect(nairaInWordsFromKobo(3_000_000)).toBe('Thirty thousand naira only');
    expect(nairaInWordsFromKobo(123_400)).toBe('One thousand two hundred and thirty-four naira only');
    expect(nairaInWordsFromKobo(100_000_000)).toBe('One million naira only');
  });
  it('writes zero', () => {
    expect(nairaInWordsFromKobo(0)).toBe('Zero naira only');
  });
  it('includes kobo when present', () => {
    expect(nairaInWordsFromKobo(505_050)).toBe('Five thousand fifty naira and fifty kobo only');
  });
  it('handles teens and tens', () => {
    expect(numberToWords(15)).toBe('fifteen');
    expect(numberToWords(40)).toBe('forty');
    expect(numberToWords(1_005)).toBe('one thousand five');
  });
  it('rejects negative or fractional input', () => {
    expect(() => numberToWords(-1)).toThrow();
    expect(() => numberToWords(1.5)).toThrow();
  });
});
