import type { Booking, Ticket } from '@core/entities/booking/booking.entity';

const MINUTE = 60_000;
const money = (amount: number) => ({ amount, currency: 'IDR' as const });

interface Holder {
  category: [id: string, name: string, gate: string, seating: Ticket['seating'], price: number];
  name: string;
  nik: string;
  code: string;
}

const FESTIVAL_A = ['cat_festival_a', 'Festival A', 'Gerbang 3', 'standing', 650000] as const;
const FESTIVAL_B = ['cat_festival_b', 'Festival B', 'Gerbang 5', 'standing', 850000] as const;
const TRIBUN_ATAS = ['cat_tribun_atas', 'Tribun Atas', 'Gerbang 9', 'seated', 470000] as const;
const FESTIVAL = ['cat_festival', 'Festival', 'Gerbang 1', 'standing', 440000] as const;
const ADMIN_FEE = 10000;

/** A paid booking and its tickets, priced from the holders (fixed admin fee per order, ADR-0010). */
function paid(
  bookingId: string,
  eventId: string,
  orderCode: string,
  paidAt: Date,
  holders: Holder[],
  paymentMethod: Booking['paymentMethod'],
): Booking {
  const tickets = holders.map<Ticket>(
    ({ category: [categoryId, categoryName, entryGate, seating], name, nik, code }, i) => ({
      ticketId: `${bookingId}_t${i + 1}`,
      ticketCode: code,
      bookingId,
      eventId,
      categoryId,
      categoryName,
      seating,
      entryGate,
      holderName: name,
      nikMasked: nik,
      qrPayload: `RSH1.${code}.bW9jay1zaWduZWQ`,
      issuedAt: paidAt.toISOString(),
    }),
  );
  const lines = [...new Set(holders.map((h) => h.category[0]))].map((categoryId) => {
    const of = holders.filter((h) => h.category[0] === categoryId);
    const [, name, , , price] = of[0].category;
    return { categoryId, name, quantity: of.length, unitPrice: money(price), lineTotal: money(price * of.length) };
  });
  const subtotal = lines.reduce((sum, line) => sum + line.lineTotal.amount, 0);
  return {
    bookingId,
    eventId,
    status: 'PAID',
    orderCode,
    price: { lines, ticketSubtotal: money(subtotal), adminFee: money(ADMIN_FEE), total: money(subtotal + ADMIN_FEE) },
    tickets,
    paidAt: paidAt.toISOString(),
    paymentMethod,
    createdAt: new Date(paidAt.getTime() - 6 * MINUTE).toISOString(),
    serverNow: paidAt.toISOString(),
  };
}

/**
 * The HiFi orders: Pelita and Samudra coming up, Kelana past (events.fixture dates them relative to `now`), plus one
 * expired booking with no tickets for the "not paid" state (`/tickets/detail?booking=bk_mock_expired`).
 */
export function bookingsFixture(now: Date): Booking[] {
  const ago = (minutes: number) => new Date(now.getTime() - minutes * MINUTE);
  const withNow = (b: Booking): Booking => ({ ...b, serverNow: now.toISOString() });
  const bookings: Booking[] = [
    paid(
      'bk_mock_samudra',
      'evt_samudra',
      'RSH-26-084731',
      ago(42),
      [
        { category: [...FESTIVAL_B], name: 'Nadia Saputri', nik: '3174 •••• •••• 0004', code: 'SMD-FB-04827' },
        { category: [...FESTIVAL_B], name: 'Raka Pratama', nik: '3201 •••• •••• 0017', code: 'SMD-FB-04828' },
        { category: [...TRIBUN_ATAS], name: 'Sinta Maharani', nik: '3273 •••• •••• 0002', code: 'SMD-TA-11902' },
      ],
      'qris',
    ),
    paid(
      'bk_mock_pelita',
      'evt_pelita',
      'RSH-26-071205',
      ago(60 * 26),
      [
        { category: [...FESTIVAL_A], name: 'Nadia Saputri', nik: '3174 •••• •••• 0004', code: 'PLT-FA-00318' },
        { category: [...FESTIVAL_A], name: 'Bagas Hidayat', nik: '3374 •••• •••• 0021', code: 'PLT-FA-00319' },
      ],
      'bca_va',
    ),
    paid(
      'bk_mock_kelana',
      'evt_kelana',
      'RSH-26-052118',
      ago(60 * 24 * 16),
      [{ category: [...FESTIVAL], name: 'Nadia Saputri', nik: '3174 •••• •••• 0004', code: 'KLN-FS-02211' }],
      'gopay',
    ),
    {
      bookingId: 'bk_mock_expired',
      eventId: 'evt_samudra',
      status: 'EXPIRED',
      orderCode: 'RSH-26-090002',
      price: { lines: [], ticketSubtotal: money(0), adminFee: money(ADMIN_FEE), total: money(ADMIN_FEE) },
      paidAt: null,
      paymentMethod: null,
      createdAt: ago(30).toISOString(),
      serverNow: now.toISOString(),
    },
  ];
  return bookings.map(withNow);
}

/** A one-page PDF that opens in any viewer: enough to check the download, not the real e-ticket layout. */
export const MOCK_TICKETS_PDF = `%PDF-1.4
1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj
2 0 obj<</Type/Pages/Kids[3 0 R]/Count 1>>endobj
3 0 obj<</Type/Page/Parent 2 0 R/MediaBox[0 0 595 842]/Contents 4 0 R/Resources<</Font<</F1 5 0 R>>>>>>endobj
4 0 obj<</Length 58>>stream
BT /F1 24 Tf 72 760 Td (Rusuh mock e-ticket PDF) Tj ET
endstream endobj
5 0 obj<</Type/Font/Subtype/Type1/BaseFont/Helvetica>>endobj
trailer<</Root 1 0 R>>
%%EOF
`;
