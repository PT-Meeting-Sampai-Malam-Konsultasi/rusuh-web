import type { PrinterProtocol } from '@core/protocols/printer.protocol';

/** The browser's print dialog; the page's print styles decide what goes on paper. Read on use, never at creation. */
export function createPrinter(getWindow: () => Window = () => window): PrinterProtocol {
  return { print: () => getWindow().print() };
}
