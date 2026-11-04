// Pure contract for small client-side storage (locale, device token). Never for secrets or NIKs.

export interface StorageProtocol {
  get(key: string): string | null;
  set(key: string, value: string): void;
  remove(key: string): void;
}
