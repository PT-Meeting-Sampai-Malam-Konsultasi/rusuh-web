import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';

import { loginController, t } from '../../__tests__/fixtures';
import LoginCode from '../LoginCode';
import LoginEmail from '../LoginEmail';
import LoginProfile from '../LoginProfile';

describe('LoginEmail', () => {
  it('labels the field, submits the form and shows the terms', async () => {
    const { emailForm } = loginController();
    render(<LoginEmail t={t} form={emailForm} />);
    const input = screen.getByLabelText('login_email_label');
    expect(input).toHaveAttribute('type', 'email');
    expect(input).toHaveAttribute('autocomplete', 'email');
    expect(screen.getByText('login_email_hint')).toBeInTheDocument();
    expect(screen.getByText(/login_terms_prefix/)).toHaveTextContent('footer_terms');
    await userEvent.click(screen.getByRole('button', { name: /login_send_code/ }));
    expect(emailForm.onSubmit).toHaveBeenCalledTimes(1);
  });

  it('shows an error under the field and a busy button', () => {
    const { emailForm } = loginController();
    render(<LoginEmail t={t} form={{ ...emailForm, error: 'login_email_invalid', submitting: true }} />);
    expect(screen.getByRole('alert')).toHaveTextContent('login_email_invalid');
    expect(screen.getByRole('button', { name: /login_send_code/ })).toBeDisabled();
  });
});

describe('LoginCode', () => {
  const code = () => loginController().code;

  it('shows where the code went, the boxes and the resend countdown; sign-in waits for six digits', async () => {
    const view = code();
    render(<LoginCode t={t} code={view} />);
    expect(screen.getByText('nadia.saputri@gmail.com')).toBeInTheDocument();
    expect(screen.getAllByRole('textbox')).toHaveLength(6);
    expect(screen.getByRole('timer')).toHaveTextContent('0:42');
    expect(screen.getByRole('button', { name: /login_submit_code/ })).toBeDisabled();
    expect(screen.getByText('login_spam_note:{"time":"9:12"}')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'login_change_email' }));
    expect(view.onChangeEmail).toHaveBeenCalled();
  });

  it('submits a full code and offers a resend once the wait is over', async () => {
    const view = { ...code(), value: '482019', resendIn: null };
    render(<LoginCode t={t} code={view} />);
    await userEvent.click(screen.getByRole('button', { name: /login_submit_code/ }));
    expect(view.onSubmit).toHaveBeenCalled();
    await userEvent.click(screen.getByRole('button', { name: 'login_resend' }));
    expect(view.onResend).toHaveBeenCalled();
  });

  it('marks a wrong code with the attempts left', () => {
    render(<LoginCode t={t} code={{ ...code(), value: '111111', state: 'wrong', message: 'wrong:2' }} />);
    expect(screen.getByRole('alert')).toHaveTextContent('wrong:2');
    expect(screen.getAllByRole('textbox')[0]).toHaveAttribute('aria-invalid', 'true');
    expect(screen.getByRole('group')).toHaveAttribute('aria-describedby', 'login-code-message');
    expect(screen.getByRole('button', { name: /login_submit_code/ })).toBeDisabled();
  });

  it.each(['expired', 'locked'] as const)('offers a new code when %s', async (state) => {
    const view = { ...code(), state, message: `m-${state}`, resendIn: null };
    render(<LoginCode t={t} code={view} />);
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('login_title_expired');
    expect(screen.getAllByRole('textbox')[0]).toBeDisabled();
    expect(screen.queryByRole('button', { name: 'login_resend' })).toBeNull();
    expect(screen.queryByText(/login_spam_note/)).toBeNull();
    await userEvent.click(screen.getByRole('button', { name: /login_send_new_code/ }));
    expect(view.onResend).toHaveBeenCalled();
  });

  it('shows a new code on its way on both resend buttons', () => {
    const { unmount } = render(<LoginCode t={t} code={{ ...code(), resendIn: null, resending: true }} />);
    expect(screen.getByRole('button', { name: 'login_resend' })).toBeDisabled();
    unmount();
    render(<LoginCode t={t} code={{ ...code(), state: 'expired', resendIn: null, resending: true }} />);
    expect(screen.getByRole('button', { name: /login_send_new_code/ })).toHaveAttribute('aria-busy', 'true');
  });

  it('shows a resend rate limit', () => {
    render(<LoginCode t={t} code={{ ...code(), resendError: 'wait 30' }} />);
    expect(screen.getByRole('alert')).toHaveTextContent('wait 30');
  });
});

describe('LoginProfile', () => {
  it('asks for the name as on the KTP, with no NIK field', async () => {
    const { profileForm } = loginController();
    render(<LoginProfile t={t} form={profileForm} />);
    expect(screen.getByText('login_stamp_new')).toBeInTheDocument();
    expect(screen.getByText('nadia.saputri@gmail.com')).toBeInTheDocument();
    expect(screen.getByLabelText('login_name_label')).toHaveAttribute('autocomplete', 'name');
    expect(screen.getAllByRole('textbox')).toHaveLength(1);
    await userEvent.click(screen.getByRole('button', { name: /login_continue_queue/ }));
    expect(profileForm.onSubmit).toHaveBeenCalled();
  });

  it('shows a name error', () => {
    const { profileForm } = loginController();
    render(<LoginProfile t={t} form={{ ...profileForm, error: 'login_name_required' }} />);
    expect(screen.getByRole('alert')).toHaveTextContent('login_name_required');
  });
});
