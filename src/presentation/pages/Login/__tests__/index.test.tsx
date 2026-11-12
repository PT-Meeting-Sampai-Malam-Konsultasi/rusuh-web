import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { LoginControllerInterface } from '@controllers/login.controller';

import LoginScreen from '../index';
import { loginController } from './fixtures';

let controller: LoginControllerInterface;

vi.mock('@infrastructure/di/container', () => ({ default: { resolve: () => controller } }));
vi.mock('@infrastructure/di/controllers/login', () => ({}));

describe('LoginScreen', () => {
  beforeEach(() => {
    controller = loginController();
  });

  it('shows the e-mail step, the event it returns to and the notes', () => {
    render(<LoginScreen />);
    expect(screen.getAllByRole('heading', { level: 1 })).toHaveLength(1);
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('login_title_email');
    const aside = screen.getByRole('complementary', { name: 'login_next_label' });
    expect(aside).toHaveTextContent('login_next_label');
    expect(aside).toHaveTextContent('Samudra'.toUpperCase());
    expect(screen.getByRole('region', { name: 'login_flow_title' })).toBeInTheDocument();
  });

  it('keeps a place for the Turnstile check while a code can be requested', () => {
    const { container, unmount } = render(<LoginScreen />);
    expect(container.querySelector('#turnstile-slot')).not.toBeNull();
    unmount();
    controller = { ...loginController(), step: 'code' };
    render(<LoginScreen />).unmount();
    controller = { ...loginController(), step: 'profile' };
    expect(render(<LoginScreen />).container.querySelector('#turnstile-slot')).toBeNull();
  });

  it('shows the code step', () => {
    controller = { ...loginController(), step: 'code' };
    render(<LoginScreen />);
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('login_title_code');
    expect(screen.getByRole('group', { name: 'login_code_label' })).toBeInTheDocument();
  });

  it('shows the profile step without notes, and no aside without an event', () => {
    controller = { ...loginController(), step: 'profile', event: null };
    render(<LoginScreen />);
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('login_title_profile');
    expect(screen.queryByRole('region', { name: 'login_flow_title' })).toBeNull();
    expect(screen.queryByRole('complementary')).toBeNull();
  });
});
