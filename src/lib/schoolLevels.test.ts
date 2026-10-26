import { describe, it, expect } from 'vitest';
import { className, cleanSubjects } from './schoolLevels';

describe('class names: level plus optional arm', () => {
  it('uses the level alone when there is no arm', () => {
    expect(className('JSS 2')).toBe('JSS 2');
    expect(className('JSS 2', '   ')).toBe('JSS 2');
  });
  it('adds the arm after the level', () => {
    expect(className('SS 2', 'Science')).toBe('SS 2 Science');
    expect(className('SS 2', 'Commercial')).toBe('SS 2 Commercial');
    expect(className('Primary 3', 'Gold')).toBe('Primary 3 Gold');
  });
});

describe('subjects', () => {
  it('trims, drops blanks, and removes duplicates ignoring capitals', () => {
    expect(cleanSubjects(['  Commerce ', '', 'commerce', 'Basic   Technology', 'Mathematics'])).toEqual(['Commerce', 'Basic Technology', 'Mathematics']);
  });
});
