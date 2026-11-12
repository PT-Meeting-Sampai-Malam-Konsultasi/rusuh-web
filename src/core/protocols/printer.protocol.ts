// Pure contract for the browser's print dialog ("Save as PDF" lives there on every platform).

export interface PrinterProtocol {
  print(): void;
}
