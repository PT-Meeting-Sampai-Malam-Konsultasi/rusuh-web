import { encode } from 'uqr';

import type { QrEncoderProtocol } from '@core/protocols/qr-encoder.protocol';

/** Level M (15% recovery) survives a scratched screen or a creased printout; a 4-module quiet zone for gate scanners. */
export function createQrEncoder(): QrEncoderProtocol {
  return {
    encode: (text) => encode(text, { ecc: 'M', border: 4 }).data,
  };
}
