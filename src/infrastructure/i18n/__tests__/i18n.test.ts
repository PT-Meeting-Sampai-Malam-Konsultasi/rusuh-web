import { describe, expect, it } from 'vitest';

import { ValidateAttendeeUseCase } from '@core/use_case/booking/validate-attendee.use-case';
import en from '@translation/locale/en.json';
import id from '@translation/locale/id.json';

import { toNikDigits } from '@utils/format/nik';

import i18n, { LOCALES } from '../index';

// Error codes from rusuh-documentation/api/openapi.yaml (ErrorCode) plus the HTTP adapter's transport codes.
const API_ERROR_CODES = [
  'VALIDATION_FAILED',
  'INTERNAL_ERROR',
  'VERIFICATION_UNAVAILABLE',
  'UNAUTHORIZED',
  'ADMISSION_INVALID',
  'ADMISSION_UNAVAILABLE',
  'NOT_FOUND',
  'RATE_LIMITED',
  'QUEUE_CLOSED',
  'NOT_YET',
  'FULL',
  'MISSED',
  'EXPIRED',
  'NO_STOCK',
  'TOO_FAR',
  'STREAM_FULL',
  'ACCOUNT_HAS_PLACE_ELSEWHERE',
  'WRONG_CODE',
  'CHALLENGE_EXPIRED',
  'CHALLENGE_LOCKED',
  'NIK_INVALID',
  'NIK_SEAT_TAKEN',
  'DUPLICATE_NIK',
  'ATTENDEE_NOT_VALIDATED',
  'QUANTITY_OVER_RESERVATION',
  'DUKCAPIL_UNAVAILABLE',
  'ACCOUNT_HAS_ACTIVE_BOOKING',
  'CATEGORY_SOLD_OUT',
  'BOOKING_NOT_HELD',
  'BOOKING_NOT_PAID',
  'NOT_CANCELLABLE',
  'CODE_INVALID',
  'PAYMENT_PROVIDER_BUSY',
  'SERVICE_UNAVAILABLE',
  'BAD_REQUEST',
  'TOO_MANY_REQUESTS',
  'NETWORK_ERROR',
  'TIMEOUT',
  'UNKNOWN_ERROR',
];

describe('translations', () => {
  it('id and en have exactly the same keys', () => {
    expect(Object.keys(en).sort()).toEqual(Object.keys(id).sort());
  });

  it('has a message for every API error code', () => {
    const missing = API_ERROR_CODES.map((c) => `error_${c.toLowerCase()}`).filter((k) => !(k in id));
    expect(missing).toEqual([]);
  });

  it('has the NIK check keys in both locales (FR-15-W1)', () => {
    const keys = [
      'order_nik_incomplete',
      'order_nik_invalid_structure',
      'order_nik_duplicate',
      'order_nik_checking',
      'order_nik_valid',
      'order_nik_use_another',
      'order_nik_rate_limited_one',
      'order_nik_rate_limited_other',
      'order_nik_rate_limited_later',
      'order_nik_unavailable',
      'order_nik_recheck',
    ];
    expect(keys.filter((k) => !(k in id))).toEqual([]);
    expect(keys.filter((k) => !(k in en))).toEqual([]);
  });

  it('has the order timer label in both locales (FR-17-W1)', () => {
    expect(id.order_timer_label).toBe('sisa waktu memilih');
    expect(en.order_timer_label).toBe('left to choose');
  });

  it('has the admission unavailable message in both locales (FR-19-W1)', () => {
    expect(id.error_admission_unavailable).toBe(
      'Pesanan Anda sedang disiapkan. Giliran Anda tetap aman, coba lagi sebentar lagi.',
    );
    expect(en.error_admission_unavailable).toBe(
      "We're getting your order ready. Your turn is safe; please try again in a moment.",
    );
  });

  it('has the payment page copy in both locales (FR-20-W1)', () => {
    const copy: Record<string, [string, string]> = {
      payment_title: ['Pembayaran', 'Payment'],
      payment_back_label: ['Kembali ke beranda', 'Back to home'],
      payment_step_done: ['selesai', 'done'],
      payment_heading: ['Bayar dengan Midtrans', 'Pay with Midtrans'],
      payment_intro: [
        'Tekan Bayar, lalu pilih cara bayar di halaman Midtrans yang terbuka di atas halaman ini.',
        'Tap Pay, then choose how to pay on the Midtrans page that opens over this one.',
      ],
      payment_intro_note: [
        'Biarkan halaman ini terbuka sampai pembayaran selesai.',
        'Keep this page open until the payment is done.',
      ],
      payment_summary_heading: ['Pesanan', 'Order'],
      payment_summary_nik: ['NIK {{nik}}', 'NIK {{nik}}'],
      payment_legal: [
        'Pembayaran diproses oleh Midtrans. Rusuh tidak menyimpan data kartu Anda.',
        'Payments are processed by Midtrans. Rusuh never stores your card details.',
      ],
      payment_pay_label: ['Bayar', 'Pay'],
      payment_pay_amount: ['Bayar {{amount}}', 'Pay {{amount}}'],
      payment_pay_again: ['Bayar lagi', 'Pay again'],
      payment_pay_reopen: ['Buka lagi pembayaran', 'Open the payment again'],
      payment_pay_busy: ['Membuka pembayaran…', 'Opening the payment…'],
      payment_dock_label: ['Pembayaran', 'Payment'],
      payment_failed: [
        'Pembayaran belum berhasil. Tiket Anda masih ditahan, jadi Anda bisa bayar lagi, juga dengan metode lain.',
        "The payment didn't go through. Your tickets are still held, so you can pay again, with another method too.",
      ],
      payment_verifying_title: ['Memastikan pembayaran Anda…', 'Confirming your payment…'],
      payment_verifying_body: [
        'Kami menunggu konfirmasi Midtrans, biasanya beberapa detik. Jangan bayar ulang.',
        "We're waiting for Midtrans to confirm, usually a few seconds. Please don't pay again.",
      ],
      payment_waiting_title: ['Menunggu pembayaran Anda', 'Waiting for your payment'],
      payment_waiting_body: [
        'Selesaikan pembayaran sesuai petunjuk Midtrans. Halaman ini berganti sendiri setelah dana masuk.',
        'Finish the payment as Midtrans showed you. This page updates by itself once it arrives.',
      ],
      payment_verifying_held: [
        'Tiket Anda tetap ditahan selama pengecekan ini.',
        'Your tickets stay held while we check.',
      ],
      payment_paid_title: ['Pembayaran diterima.', 'Payment received.'],
      payment_paid_body: ['Membuka e-tiket Anda…', 'Opening your e-tickets…'],
      payment_inactive_title: ['Pesanan ini sudah tidak aktif.', 'This order is no longer active.'],
      payment_inactive_body: [
        'Waktu pembayaran sudah habis atau pesanan dibatalkan, jadi tiketnya kami lepas untuk pembeli lain.',
        "The time to pay ran out or the order was cancelled, so we've released the tickets to other buyers.",
      ],
      payment_inactive_refund: [
        'Saldo terpotong? Pembayaran Anda masuk setelah waktu habis. Dana akan kami kembalikan; rinciannya kami kirim ke email akun Anda.',
        "Money already taken? Your payment arrived after the time ran out. We'll refund it and email the details to your account address.",
      ],
      payment_not_found_title: ['Pesanan tidak ditemukan.', 'Order not found.'],
      payment_not_found_body: [
        'Tautan pembayaran ini salah, atau pesanannya milik akun lain.',
        'This payment link is wrong, or the order belongs to another account.',
      ],
      payment_error_title: ['Halaman pembayaran gagal dimuat.', "The payment page didn't load."],
      payment_fallback_body: [
        'Halaman pembayaran gagal dimuat. Tiket Anda tetap ditahan; coba lagi atau kembali nanti.',
        "The payment page didn't load. Your tickets are still held; try again or come back soon.",
      ],
    };
    for (const [key, [idValue, enValue]] of Object.entries(copy)) {
      expect((id as Record<string, string>)[key], key).toBe(idValue);
      expect((en as Record<string, string>)[key], key).toBe(enValue);
    }
    // H-4: the refund is promised, not "otomatis".
    expect(id.payment_inactive_refund).not.toMatch(/otomatis/);
    // Same order in both files.
    const order = (strings: Record<string, string>) => Object.keys(strings).filter((k) => k.startsWith('payment_'));
    expect(order(id)).toEqual(order(en));
    expect(order(id)).toEqual(Object.keys(copy));
  });

  it('uses a NIK hint example that passes the structure rule in both locales', () => {
    const useCase = ValidateAttendeeUseCase({ bookingService: {} as never });
    for (const hint of [id.order_holder_nik_hint, en.order_holder_nik_hint]) {
      expect(useCase.checkNik(toNikDigits(hint), [])).toEqual({ kind: 'ok' });
    }
  });

  it('uses flat snake_case keys with non-empty values', () => {
    for (const [k, v] of Object.entries(id)) {
      expect(k).toMatch(/^[a-z0-9_]+$/);
      expect(v).not.toBe('');
    }
  });
});

describe('i18n instance', () => {
  it('defaults to Bahasa Indonesia and switches to English', async () => {
    expect(LOCALES).toEqual(['id', 'en']);
    expect(i18n.language).toBe('id');
    expect(i18n.t('action_retry')).toBe('Coba lagi');
    await i18n.changeLanguage('en');
    expect(i18n.t('action_retry')).toBe('Try again');
    await i18n.changeLanguage('id');
  });

  it('picks the singular and plural of the order limit lines', async () => {
    expect(i18n.t('order_limit_reached', { count: 3 })).toBe(
      'Batas 3 tiket tercapai. Kurangi satu untuk ganti kategori.',
    );
    expect(i18n.t('order_limit_reached_reserved', { count: 2 })).toBe(
      'Kuota giliran Anda 2 tiket. Kurangi satu untuk ganti kategori.',
    );
    await i18n.changeLanguage('en');
    expect(i18n.t('order_limit_reached', { count: 3 })).toBe(
      "You've hit the 3-ticket limit. Remove one to switch category.",
    );
    expect(i18n.t('order_limit_reached_reserved', { count: 1 })).toBe(
      'Your turn holds 1 ticket. Remove one to switch category.',
    );
    expect(i18n.t('order_limit_reached_reserved', { count: 2 })).toBe(
      'Your turn holds 2 tickets. Remove one to switch category.',
    );
    await i18n.changeLanguage('id');
  });

  it('interpolates the NIK duplicate line and picks the rate-limit plural', async () => {
    expect(i18n.t('order_nik_duplicate', { index: 1 })).toBe(
      'NIK ini sudah dipakai di Tiket 1. Setiap tiket butuh NIK orang yang berbeda.',
    );
    expect(i18n.t('order_nik_rate_limited', { count: 60 })).toBe(
      'Terlalu banyak percobaan untuk tiket ini. Coba lagi dalam 60 detik.',
    );
    await i18n.changeLanguage('en');
    expect(i18n.t('order_nik_duplicate', { index: 1 })).toBe(
      "This NIK is already on Ticket 1. Each ticket needs a different person's NIK.",
    );
    expect(i18n.t('order_nik_rate_limited', { count: 1 })).toBe(
      'Too many tries for this ticket. Try again in 1 second.',
    );
    expect(i18n.t('order_nik_rate_limited', { count: 60 })).toBe(
      'Too many tries for this ticket. Try again in 60 seconds.',
    );
    await i18n.changeLanguage('id');
  });

  it("has the time's-up sheet copy in both locales (FR-18-W1)", async () => {
    expect(i18n.t('order_time_up_stamp')).toBe('Waktu habis');
    expect(i18n.t('order_time_up_title')).toBe('5 menit sudah lewat.');
    expect(i18n.t('order_time_up_body')).toBe(
      'Pilihan Anda belum disimpan dan tempat Anda kami berikan ke nomor berikutnya. Antre lagi untuk mencoba lagi.',
    );
    expect(i18n.t('order_time_up_queue_again')).toBe('Antre lagi');
    expect(i18n.t('action_back_home')).toBe('Ke beranda');
    await i18n.changeLanguage('en');
    expect(i18n.t('order_time_up_stamp')).toBe("Time's up");
    expect(i18n.t('order_time_up_title')).toBe('Your 5 minutes are up.');
    expect(i18n.t('order_time_up_body')).toBe(
      "Your picks weren't saved and your place went to the next number. Queue again to try once more.",
    );
    expect(i18n.t('order_time_up_queue_again')).toBe('Queue again');
    expect(i18n.t('action_back_home')).toBe('Go home');
    await i18n.changeLanguage('id');
  });

  it('has the summary, checkout and hold copy in both locales (FR-16-W1)', async () => {
    expect(i18n.t('order_summary_heading')).toBe('Ringkasan');
    expect(i18n.t('order_summary_line', { quantity: 2, category: 'Festival B' })).toBe('2 × Festival B');
    expect(i18n.t('order_summary_fee')).toBe('Biaya layanan');
    expect(i18n.t('order_summary_total')).toBe('Total');
    expect(i18n.t('order_summary_note')).toBe(
      'Tiket ditahan untuk Anda selama 10 menit saat Anda lanjut. Belum ada biaya sampai Anda membayar.',
    );
    expect(i18n.t('order_summary_tickets', { count: 1 })).toBe('1 tiket');
    expect(i18n.t('order_summary_tickets', { count: 3 })).toBe('3 tiket');
    expect(i18n.t('order_summary_dock_label')).toBe('Ringkasan pesanan');
    expect(i18n.t('order_checkout_label')).toBe('Lanjut ke pembayaran');
    expect(i18n.t('order_checkout_short_label')).toBe('Lanjut bayar');
    expect(i18n.t('order_checkout_hint_holders')).toBe('Lengkapi data pemegang tiket untuk lanjut.');
    expect(i18n.t('order_hold_sold_out', { category: 'Festival B' })).toBe(
      'Festival B sudah habis. Kurangi tiketnya atau pilih kategori lain.',
    );
    expect(i18n.t('order_hold_over_reservation')).toBe(
      'Jumlah tiket melebihi kuota giliran Anda. Kurangi tiketnya lalu lanjut lagi.',
    );
    expect(i18n.t('order_hold_open_active')).toBe('Buka pesanan itu');
    await i18n.changeLanguage('en');
    expect(i18n.t('order_summary_heading')).toBe('Summary');
    expect(i18n.t('order_summary_line', { quantity: 2, category: 'Festival B' })).toBe('2 × Festival B');
    expect(i18n.t('order_summary_fee')).toBe('Service fee');
    expect(i18n.t('order_summary_total')).toBe('Total');
    expect(i18n.t('order_summary_note')).toBe(
      'We hold the tickets for 10 minutes once you continue. Nothing is charged until you pay.',
    );
    expect(i18n.t('order_summary_tickets', { count: 1 })).toBe('1 ticket');
    expect(i18n.t('order_summary_tickets', { count: 3 })).toBe('3 tickets');
    expect(i18n.t('order_summary_dock_label')).toBe('Order summary');
    expect(i18n.t('order_checkout_label')).toBe('Continue to payment');
    expect(i18n.t('order_checkout_short_label')).toBe('Continue');
    expect(i18n.t('order_checkout_hint_holders')).toBe("Complete the ticket holders' details to continue.");
    expect(i18n.t('order_hold_sold_out', { category: 'Festival B' })).toBe(
      'Festival B has sold out. Remove those tickets or pick another category.',
    );
    expect(i18n.t('order_hold_over_reservation')).toBe(
      'You picked more tickets than your turn allows. Remove some and continue again.',
    );
    expect(i18n.t('order_hold_open_active')).toBe('Open that order');
    await i18n.changeLanguage('id');
  });
});
