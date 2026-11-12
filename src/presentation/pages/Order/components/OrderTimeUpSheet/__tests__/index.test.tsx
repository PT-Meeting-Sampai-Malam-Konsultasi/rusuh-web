import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import type { OrderTimeUpView } from '@controllers/order.controller';
import en from '@translation/locale/en.json';
import id from '@translation/locale/id.json';

import OrderTimeUpSheet from '../index';

const keys = (): OrderTimeUpView => ({
  stamp: 'order_time_up_stamp',
  title: 'order_time_up_title',
  body: 'order_time_up_body',
  queueAgainLabel: 'order_time_up_queue_again',
  homeLabel: 'action_back_home',
  homeHref: '/',
  queueAgain: vi.fn(),
});

describe('OrderTimeUpSheet', () => {
  it('is a modal dialog named by the title and described by the body, with the stamp and an h2', () => {
    render(<OrderTimeUpSheet sheet={keys()} />);
    const dialog = screen.getByRole('dialog', { name: 'order_time_up_title' });
    expect(dialog).toHaveAttribute('aria-modal', 'true');
    expect(dialog).toHaveAccessibleDescription('order_time_up_body');
    expect(within(dialog).getByText('order_time_up_stamp')).toBeInTheDocument();
    expect(within(dialog).getByRole('heading', { level: 2 })).toHaveTextContent('order_time_up_title');
  });

  it('focuses the primary button, named without the hidden arrow', () => {
    render(<OrderTimeUpSheet sheet={keys()} />);
    const button = screen.getByRole('button', { name: 'order_time_up_queue_again' });
    expect(button).toHaveFocus();
    const arrow = within(button).getByText('→');
    expect(arrow).toHaveAttribute('aria-hidden', 'true');
  });

  it('calls queueAgain once on click and links home', async () => {
    const sheet = keys();
    render(<OrderTimeUpSheet sheet={sheet} />);
    await userEvent.click(screen.getByRole('button', { name: 'order_time_up_queue_again' }));
    expect(sheet.queueAgain).toHaveBeenCalledTimes(1);
    expect(screen.getByRole('link', { name: 'action_back_home' })).toHaveAttribute('href', '/');
  });

  it('is not dismissible: Escape and a scrim click do nothing; one button only', async () => {
    const sheet = keys();
    render(<OrderTimeUpSheet sheet={sheet} />);
    const dialog = screen.getByRole('dialog');
    await userEvent.keyboard('{Escape}');
    await userEvent.click(dialog.parentElement as HTMLElement);
    expect(sheet.queueAgain).not.toHaveBeenCalled();
    expect(screen.getByRole('dialog')).toBeInTheDocument();
    expect(within(dialog).getAllByRole('button')).toHaveLength(1);
  });

  it.each([
    { locale: 'id', strings: id, title: '5 menit sudah lewat.', button: 'Antre lagi', home: 'Ke beranda' },
    { locale: 'en', strings: en, title: 'Your 5 minutes are up.', button: 'Queue again', home: 'Go home' },
  ])('reads the real $locale copy', ({ strings, title, button, home }) => {
    render(
      <OrderTimeUpSheet
        sheet={{
          stamp: strings.order_time_up_stamp,
          title: strings.order_time_up_title,
          body: strings.order_time_up_body,
          queueAgainLabel: strings.order_time_up_queue_again,
          homeLabel: strings.action_back_home,
          homeHref: '/',
          queueAgain: vi.fn(),
        }}
      />,
    );
    expect(screen.getByRole('dialog', { name: title })).toHaveAccessibleDescription(strings.order_time_up_body);
    expect(screen.getByRole('button', { name: button })).toHaveFocus();
    expect(screen.getByRole('link', { name: home })).toBeInTheDocument();
  });

  describe('styles', () => {
    const css = readFileSync(join(__dirname, '..', 'order-time-up-sheet.module.css'), 'utf8');
    const rule = (name: string) => {
      const start = css.indexOf(`.${name} {`);
      const next = css.indexOf('\n}\n', start);
      return css.slice(start, next);
    };
    const split = (block: string) => {
      const md = block.indexOf('@variant md');
      return md === -1 ? { base: block, md: '' } : { base: block.slice(0, md), md: block.slice(md) };
    };

    it('starts with the @reference to the app styles', () => {
      expect(css.split('\n')[0]).toBe('@reference "../../../../../styles/app.css";');
    });

    it('is a bottom sheet on phones and a 520px dialog with the pink offset from md', () => {
      const sheet = split(rule('sheet'));
      expect(sheet.base).toContain('border-t-[2.5px]');
      expect(sheet.base).toContain('px-5 pt-[26px] pb-[30px]');
      expect(sheet.base).not.toContain('box-shadow');
      expect(sheet.md).toContain('max-w-[520px]');
      expect(sheet.md).toContain('border-[2.5px]');
      expect(sheet.md).toContain('p-8');
      expect(sheet.md).toContain('6px 6px 0 var(--color-pink)');
      const scrim = split(rule('scrim'));
      expect(scrim.base).toContain('place-items-end');
      expect(scrim.base).toContain('p-0');
      expect(scrim.md).toContain('place-items-center p-4');
    });

    it('gives the link a 44px target and a focus style; no hex, no motion', () => {
      const link = rule('link');
      expect(link).toContain('min-h-11');
      expect(link).toContain(':focus-visible');
      expect(css).not.toMatch(/#[0-9a-fA-F]{3,8}\b/);
      expect(css).not.toMatch(/transition|animation/);
    });
  });
});
