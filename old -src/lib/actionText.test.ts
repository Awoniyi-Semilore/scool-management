import { describe, it, expect } from 'vitest';
import { describeAction } from './actionText';

describe('plain-English actions', () => {
  it('says who did what', () => {
    expect(describeAction({ action: 'teacher.create', details: 'Miss Gbemi · full time', actorEmail: 'awoniyi@school.ng', targetId: 'T1' }))
      .toBe('awoniyi@school.ng added a teacher: Miss Gbemi · full time.');
  });
  it('falls back to the raw action name for an unknown action', () => {
    expect(describeAction({ action: 'new.thing', details: '', actorEmail: 'x@y.z', targetId: null as unknown as string }))
      .toBe('x@y.z did “new.thing”.');
  });
});
