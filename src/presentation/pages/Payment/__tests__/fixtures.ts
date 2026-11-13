import { vi } from 'vitest';

import type {
  PaymentActionView,
  PaymentIntroView,
  PaymentMessageView,
  PaymentProgressView,
  PaymentSummaryView,
} from '@controllers/payment.controller';

export const summaryView = (): PaymentSummaryView => ({
  heading: 'payment_summary_heading',
  orderCode: 'RSH-26-084731',
  eventLine: 'SAMUDRA · Sab, 12 Des 2026 · GBK',
  lines: [
    { key: '0', category: 'Festival B', nik: 'NIK 3174 •••• •••• 0004', amount: 'Rp 850.000' },
    { key: '1', category: 'Festival B', nik: 'NIK 3201 •••• •••• 0017', amount: 'Rp 850.000' },
    { key: '2', category: 'Tribun Atas', nik: 'NIK 3273 •••• •••• 0002', amount: 'Rp 450.000' },
  ],
  feeLabel: 'order_summary_fee',
  fee: 'Rp 10.000',
  totalLabel: 'order_summary_total',
  total: 'Rp 2.160.000',
  legal: 'payment_legal',
});

export const payView = (over: Partial<PaymentActionView> = {}): PaymentActionView => ({
  label: 'payment_pay_label',
  dockLabel: 'payment_pay_amount',
  dockRegionLabel: 'payment_dock_label',
  busyLabel: 'payment_pay_busy',
  busy: false,
  enabled: true,
  onPay: vi.fn(),
  ...over,
});

export const introView = (): PaymentIntroView => ({
  heading: 'payment_heading',
  body: 'payment_intro',
  note: 'payment_intro_note',
});

export const progressView = (over: Partial<PaymentProgressView> = {}): PaymentProgressView => ({
  reason: 'confirming',
  title: 'payment_verifying_title',
  body: 'payment_verifying_body',
  held: 'payment_verifying_held',
  ...over,
});

export const messageView = (over: Partial<PaymentMessageView> = {}): PaymentMessageView => ({
  title: 'payment_inactive_title',
  body: 'payment_inactive_body',
  note: null,
  actionLabel: null,
  onAction: null,
  homeHref: '/',
  homeLabel: 'action_back_home',
  ...over,
});
