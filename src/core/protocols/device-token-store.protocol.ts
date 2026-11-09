// Pure contract for this browser's device token (ADR-0003: kept in local storage, so a refresh keeps the place).

export interface DeviceTokenStoreProtocol {
  get(): string | null;
  set(token: string): void;
  /** After the queue rejects the token (401): the next join registers again. */
  clear(): void;
}
