import type { EventSummary } from '@core/entities/catalog/catalog.entity';

const DAY = 86_400_000;
const WIB_OFFSET_HOURS = 7;

/** The five HiFi events plus one more live sale (so the list shows an active card), dated relative to `now` so "coming soon" and "sold in 41 minutes" stay true. */
export function eventsFixture(now: Date): EventSummary[] {
  /** `days` from today at a fixed local time (WIB unless an offset is given), like a real schedule. */
  const at = (days: number, hour: number, minute = 0, utcOffset = WIB_OFFSET_HOURS) => {
    const d = new Date(now.getTime() + days * DAY);
    d.setUTCHours(hour - utcOffset, minute, 0, 0);
    return d.toISOString();
  };
  const plusMinutes = (iso: string, minutes: number) => new Date(Date.parse(iso) + minutes * 60_000).toISOString();
  const deruSale = at(-6, 10);
  return [
    {
      eventId: 'evt_samudra',
      name: 'Samudra',
      subtitle: 'Tur Gelombang 2026',
      format: 'Tour',
      venue: 'Stadion Utama GBK',
      venueShort: 'GBK',
      city: 'Jakarta',
      timezone: 'Asia/Jakarta',
      startsAt: at(38, 19),
      saleOpensAt: at(-1, 10),
      waitingRoomOpensAt: at(-1, 9, 30),
      saleEndsAt: at(35, 23, 59),
      state: 'waiting_room_open',
      priceFrom: { amount: 450000, currency: 'IDR' },
      capacity: 12000,
    },
    {
      eventId: 'evt_pelita',
      name: 'Pelita',
      subtitle: 'Tur Kota Lama',
      format: 'Live',
      venue: 'Lapangan Simpang Lima',
      venueShort: 'Simpang Lima',
      city: 'Semarang',
      timezone: 'Asia/Jakarta',
      startsAt: at(25, 19, 30),
      saleOpensAt: at(-1, 13),
      waitingRoomOpensAt: at(-1, 12, 30),
      state: 'almost_gone',
      priceFrom: { amount: 350000, currency: 'IDR' },
      capacity: 9000,
    },
    {
      eventId: 'evt_langit_sore',
      name: 'Langit Sore',
      subtitle: 'Senja Panjang',
      format: 'Live',
      venue: 'Stadion Kridosono',
      city: 'Yogyakarta',
      timezone: 'Asia/Jakarta',
      startsAt: at(66, 18, 30),
      saleOpensAt: at(8, 10),
      waitingRoomOpensAt: at(8, 9, 30),
      state: 'coming_soon',
      priceFrom: { amount: 325000, currency: 'IDR' },
      capacity: 8000,
    },
    {
      eventId: 'evt_rimba',
      name: 'Rimba',
      subtitle: 'Pesta Akar 2026',
      format: 'Festival',
      venue: 'GOR Saparua',
      city: 'Bandung',
      timezone: 'Asia/Jakarta',
      startsAt: at(18, 16),
      saleOpensAt: at(-2, 10),
      state: 'temporarily_full',
      priceFrom: { amount: 275000, currency: 'IDR' },
      capacity: 5000,
    },
    {
      eventId: 'evt_deru',
      name: 'Deru',
      subtitle: 'Malam Mesin',
      format: 'Live',
      venue: 'Jatim Expo',
      city: 'Surabaya',
      timezone: 'Asia/Jakarta',
      startsAt: at(30, 20),
      saleOpensAt: deruSale,
      soldOutAt: plusMinutes(deruSale, 41),
      state: 'sold_out',
      priceFrom: { amount: 300000, currency: 'IDR' },
      capacity: 12000,
    },
    {
      eventId: 'evt_kelana',
      name: 'Kelana',
      subtitle: 'Tur Pulau',
      format: 'Tour',
      venue: 'Lapangan Puputan',
      city: 'Denpasar',
      timezone: 'Asia/Makassar',
      startsAt: at(-3, 19, 0, 8),
      saleOpensAt: at(-20, 10, 0, 8),
      saleEndsAt: at(-5, 12, 0, 8),
      state: 'ended',
      capacity: 6000,
    },
  ];
}
