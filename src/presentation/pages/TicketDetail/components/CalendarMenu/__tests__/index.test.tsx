import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import CalendarMenu from '..';

const t = ((key: string) => key) as never;

describe('CalendarMenu', () => {
  it('opens to Google and Outlook links in a new tab and the .ics download', async () => {
    const calendar = {
      googleUrl: 'https://calendar.google.com/calendar/render?action=TEMPLATE',
      outlookUrl: 'https://outlook.live.com/calendar/0/deeplink/compose',
      downloadIcs: vi.fn(),
      onPick: vi.fn(),
    };
    render(<CalendarMenu t={t} calendar={calendar} />);
    await userEvent.click(screen.getByText('ticket_calendar'));

    const google = screen.getByRole('link', { name: /ticket_calendar_google/ });
    expect(google).toHaveAttribute('href', calendar.googleUrl);
    expect(google).toHaveAttribute('target', '_blank');
    expect(google).toHaveAttribute('rel', 'noopener noreferrer');
    google.addEventListener('click', (event) => event.preventDefault());
    await userEvent.click(google);
    expect(calendar.onPick).toHaveBeenCalledWith('google');

    const outlook = screen.getByRole('link', { name: /ticket_calendar_outlook/ });
    expect(outlook).toHaveAttribute('href', calendar.outlookUrl);
    outlook.addEventListener('click', (event) => event.preventDefault());
    await userEvent.click(outlook);
    expect(calendar.onPick).toHaveBeenCalledWith('outlook');

    await userEvent.click(screen.getByRole('button', { name: /ticket_calendar_ics/ }));
    expect(calendar.downloadIcs).toHaveBeenCalled();
  });
});
