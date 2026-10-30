# Add a service

API gateway for one aggregate. Delegate to `service-writer`.

## Steps

1. `src/core/services/{domain}.service.ts`: interface (named export) + factory.
2. `src/core/services/__tests__/{domain}.service.test.ts`.
3. Register in `services.registry.ts` as `asFunction(Service).singleton()`.
4. Add the interface to `AwilixRegistry`.

## Template

```ts
// src/core/services/booking.service.ts
import type { HttpResponse } from '@core/protocols/http.protocol';
import type { Booking, CreateBookingRequest } from '@core/entities/booking/booking.entity';
import type { AwilixRegistry } from '@infrastructure/di/registry.types';

export interface BookingServiceInterface {
  createBooking: (payload: CreateBookingRequest, admissionToken: string) => Promise<HttpResponse<Booking>>;
  getBooking: (bookingId: string) => Promise<HttpResponse<Booking>>;
}

export const BookingService = ({ coreHttp }: Pick<AwilixRegistry, 'coreHttp'>): BookingServiceInterface => ({
  createBooking: (payload, admissionToken) =>
    coreHttp.post<Booking, CreateBookingRequest>('bookings', payload, {
      headers: { 'X-Admission-Token': admissionToken },
    }),
  getBooking: (bookingId) => coreHttp.get<Booking>(`bookings/${bookingId}`),
});
```

## Test template

```ts
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { BookingService } from '../booking.service';

describe('BookingService', () => {
  const coreHttp = { get: vi.fn(), post: vi.fn(), put: vi.fn(), patch: vi.fn(), delete: vi.fn() };
  const service = BookingService({ coreHttp });

  beforeEach(() => vi.clearAllMocks());

  it('posts the booking with the admission token', async () => {
    coreHttp.post.mockResolvedValue({ data: { bookingId: 'b1' }, status: 201 });
    await service.createBooking({ eventId: 'e', lines: [], attendees: [] }, 'adm');
    expect(coreHttp.post).toHaveBeenCalledWith('bookings', { eventId: 'e', lines: [], attendees: [] }, {
      headers: { 'X-Admission-Token': 'adm' },
    });
  });
});
```

## Registration

```ts
// services.registry.ts
container.register({ bookingService: asFunction(BookingService).singleton() });
```
