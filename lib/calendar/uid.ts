/**
 * Stable event UIDs. The same ESPN event must keep the same UID on every feed
 * refresh so calendar clients update events in place instead of duplicating
 * them. Deliberately independent of the deployment origin.
 */
export const UID_DOMAIN = "sportscal.site";

/** `scope` is the ESPN team id for canonical feeds or the public id for saved calendars. */
export function eventUid(eventId: string, scope: string): string {
  return `espn-${eventId}-${scope}@${UID_DOMAIN}`;
}
