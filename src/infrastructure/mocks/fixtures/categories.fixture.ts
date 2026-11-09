import type { Category } from '@core/entities/booking/booking.entity';

/** The four HiFi categories (analysis/hifi/src/detail.html); names stay the same, descriptions follow the locale. */
export function categoriesFixture(locale: 'id' | 'en'): Category[] {
  const en = locale === 'en';
  return [
    {
      categoryId: 'cat_festival_a',
      name: 'Festival A',
      description: en ? 'Standing · closest to the stage' : 'Berdiri · paling dekat panggung',
      seating: 'standing',
      price: { amount: 1250000, currency: 'IDR' },
      availability: 'sold_out',
    },
    {
      categoryId: 'cat_festival_b',
      name: 'Festival B',
      description: en ? 'Standing · behind Festival A' : 'Berdiri · di belakang Festival A',
      seating: 'standing',
      price: { amount: 850000, currency: 'IDR' },
      availability: 'available',
    },
    {
      categoryId: 'cat_tribun_bawah',
      name: 'Tribun Bawah',
      description: en ? 'Seated · any free seat in the lower stand' : 'Duduk · bebas pilih kursi di tribun bawah',
      seating: 'seated',
      price: { amount: 650000, currency: 'IDR' },
      availability: 'almost_gone',
    },
    {
      categoryId: 'cat_tribun_atas',
      name: 'Tribun Atas',
      description: en ? 'Seated · any free seat in the upper stand' : 'Duduk · bebas pilih kursi di tribun atas',
      seating: 'seated',
      price: { amount: 450000, currency: 'IDR' },
      availability: 'available',
    },
  ];
}
