/** Time-of-day greeting from the device clock. */
export function greetingFor(hour: number): string {
  if (hour < 12) return 'Good morning';
  if (hour < 17) return 'Good afternoon';
  return 'Good evening';
}
export function greetingNow(): string {
  return greetingFor(new Date().getHours());
}
