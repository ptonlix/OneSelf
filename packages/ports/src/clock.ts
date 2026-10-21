/**
 * Current instant for expiry, retention, and object write times.
 * Callers add durations; this port does not know about 15 minutes, 30 days, or 7 days.
 */
export interface Clock {
  now(): Date;
}
