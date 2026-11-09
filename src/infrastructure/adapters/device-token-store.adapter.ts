import type { DeviceTokenStoreProtocol } from '@core/protocols/device-token-store.protocol';
import type { StorageProtocol } from '@core/protocols/storage.protocol';
import { STORAGE_KEYS } from '@utils/constants/storage-keys';

/** The device token in local storage (ADR-0003). It names an anonymous device, not an account. */
export function createDeviceTokenStore({ storage }: { storage: StorageProtocol }): DeviceTokenStoreProtocol {
  return {
    get: () => storage.get(STORAGE_KEYS.DEVICE_TOKEN),
    set: (token) => storage.set(STORAGE_KEYS.DEVICE_TOKEN, token),
    clear: () => storage.remove(STORAGE_KEYS.DEVICE_TOKEN),
  };
}
