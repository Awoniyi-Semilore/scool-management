import { describe, it, expect } from 'vitest';
import { describeAction, legacyActionReference } from './actionText';

describe('plain-English actions', () => {
  it('says who did what', () => {
    expect(describeAction({ action: 'teacher.create', details: 'Miss Gbemi · full time', actorEmail: 'awoniyi@school.ng', targetId: 'T1' }))
      .toBe('awoniyi@school.ng added a teacher: Miss Gbemi · full time.');
  });
  it('shows parent and pupil names for an approved link', () => {
    expect(describeAction({ action: 'link.approved', details: 'Linked parent Mrs Adah Cole to pupil Awoniyi Samuel', actorEmail: 'olusholawoniyi04@gmail.com', targetId: 'R1' }))
      .toBe('olusholawoniyi04@gmail.com did “link.approved”: Linked parent Mrs Adah Cole to pupil Awoniyi Samuel.');
  });
  it('resolves pupil IDs in old charge actions to the pupil name', () => {
    const event = { action: 'charge.fee', details: 'fee 2500000 kobo for pupil MrFr9VQ1SJROfK2ebLfV', actorEmail: 'olusholawoniyi04@gmail.com', targetId: 'C1' };
    expect(legacyActionReference(event)).toEqual({ pupilId: 'MrFr9VQ1SJROfK2ebLfV' });
    expect(describeAction(event, { pupilName: 'Awoniyi Samuel' }))
      .toBe('olusholawoniyi04@gmail.com added a fee of ₦25,000.00 for Awoniyi Samuel.');
    expect(describeAction({ ...event, details: 'fee ₦25,000.00 for pupil Awoniyi Samuel' }))
      .toBe('olusholawoniyi04@gmail.com added a fee of ₦25,000.00 for Awoniyi Samuel.');
  });
  it('resolves parent and pupil IDs in old link actions', () => {
    const event = { action: 'link.approved', details: 'Linked parent u2U2q5g3OeUm8QxmyRfZNUWJOYU2 to pupil MrFr9VQ1SJROfK2ebLfV' };
    expect(legacyActionReference(event)).toEqual({ parentUid: 'u2U2q5g3OeUm8QxmyRfZNUWJOYU2', pupilId: 'MrFr9VQ1SJROfK2ebLfV' });
  });
  it('falls back to the raw action name for an unknown action', () => {
    expect(describeAction({ action: 'new.thing', details: '', actorEmail: 'x@y.z', targetId: null as unknown as string }))
      .toBe('x@y.z did “new.thing”.');
  });
});
