// Pure contract for the in-memory admission tokens, one per event (filled after claimTurn, FR-08-W1).

export interface AdmissionStoreProtocol {
  /** The admission token for this event, or null when there is none (never claimed, cleared, or lost on refresh). */
  get(eventId: string): string | null;
  /** Stores the token for the event; null removes it. Called by FR-08-W1 after claimTurn. */
  set(eventId: string, token: string | null): void;
}
