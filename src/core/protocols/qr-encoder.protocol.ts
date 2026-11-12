// Pure contract for turning a ticket's QR payload into modules to draw.

export interface QrEncoderProtocol {
  /** Square matrix, `true` = dark module, quiet zone included. */
  encode(text: string): boolean[][];
}
