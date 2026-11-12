# Design Document

```ts
interface BookingServiceInterface {
  getCategories(eventId: string, admissionToken: string): Promise<HttpResponse<GetCategoriesResponse>>;
  getBooking(bookingId: string): Promise<HttpResponse<Booking>>;
  listMyTickets(): Promise<HttpResponse<ListMyTicketsResponse>>;
  downloadTickets(bookingId: string): Promise<HttpResponse<Blob>>;
}

interface FileSaverProtocol {
  save(data: Blob | string, filename: string, type?: string): void;
}
interface QrEncoderProtocol {
  encode(text: string): boolean[][];
}
interface PrinterProtocol {
  print(): void;
}
```

`RequestConfig` gains `responseType?: 'blob'`; the HTTP adapter passes it to Axios and parses a JSON problem that
arrives as a Blob before mapping the error. QR: `uqr` 0.1.3 (MIT, no dependencies).

## Layer Constraints

- Services: one method per endpoint, no logic, errors pass through unchanged.
- Adapters implement a `core/protocols` contract; only infrastructure imports libraries.
- Every key in `AwilixRegistry` has a `container.register()` call.
