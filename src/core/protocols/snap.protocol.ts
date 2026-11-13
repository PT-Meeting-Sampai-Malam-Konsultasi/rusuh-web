// Pure contract for Midtrans Snap (snap.js popup, ADR-0008).

/** How the Snap popup ended. A hint only: the payment is confirmed by getPaymentStatus, never by this (LLD-03 §4.3). */
export type SnapPayResult =
  | { kind: 'success' } // onSuccess: Midtrans reports a settled / captured transaction
  | { kind: 'pending' } // onPending: a VA / QRIS / e-wallet transaction waits for the money
  | { kind: 'error' } // onError: the transaction failed inside Snap
  | { kind: 'closed' }; // onClose: closed without finishing

export interface SnapProtocol {
  /** Loads snap.js once (no-op when loaded). Rejects with an HttpError coded SNAP_UNAVAILABLE. */
  load(): Promise<void>;
  /** Opens the Snap popup for this token; resolves with the first callback. Rejects with SNAP_UNAVAILABLE. */
  pay(snapToken: string): Promise<SnapPayResult>;
}
