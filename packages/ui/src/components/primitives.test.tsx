import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import axe from 'axe-core';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  Avatar,
  Badge,
  Button,
  Checkbox,
  Chip,
  EmptyState,
  ErrorState,
  IconButton,
  Input,
  Select,
  Spinner,
  Switch,
  TextArea,
} from './primitives.js';

afterEach(cleanup);

describe('Ember core primitives', () => {
  it('[P1-06] provides button variants, icon names, and loading state', () => {
    render(
      <>
        <Button>Continue</Button>
        <Button loading>Saving</Button>
        <Button disabled>Unavailable</Button>
        <IconButton aria-label="Close dialog">×</IconButton>
      </>,
    );
    expect(screen.getByRole('button', { name: 'Continue' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Saving' }).getAttribute('aria-busy')).toBe('true');
    expect(screen.getByRole('button', { name: 'Saving' }).hasAttribute('disabled')).toBe(true);
    expect(screen.getByRole('status').textContent).toBe('Loading');
    expect(screen.getByRole('button', { name: 'Close dialog' })).toBeTruthy();
  });

  it('[P1-06] connects field labels and validation messages to controls', () => {
    render(
      <>
        <Input label="Email" type="email" error="Enter a valid email." />
        <TextArea label="Bio" hint="Optional" />
        <Select label="Language" options={[{ value: 'en', label: 'English' }]} />
      </>,
    );
    const email = screen.getByRole('textbox', { name: 'Email' });
    expect(email.getAttribute('aria-invalid')).toBe('true');
    expect(screen.getByText('Enter a valid email.').id).toBe(
      email.getAttribute('aria-describedby'),
    );
    expect(screen.getByRole('textbox', { name: 'Bio' })).toBeTruthy();
    expect(screen.getByRole('combobox', { name: 'Language' })).toBeTruthy();
  });

  it('[P1-06] exposes toggle selection and switch state to assistive technology', async () => {
    const user = userEvent.setup();
    const onClick = vi.fn();
    const view = render(
      <>
        <Checkbox label="Accept safety rules" />
        <Switch label="Show online status" />
        <Chip onClick={onClick}>Music</Chip>
      </>,
    );
    const checkbox = screen.getByRole('checkbox', { name: 'Accept safety rules' });
    const toggle = screen.getByRole('switch', { name: 'Show online status' });
    const chip = screen.getByRole('button', { name: 'Music' });
    await user.click(checkbox);
    await user.click(toggle);
    await user.click(chip);
    expect((checkbox as HTMLInputElement).checked).toBe(true);
    expect((toggle as HTMLInputElement).checked).toBe(true);
    expect(onClick).toHaveBeenCalledOnce();
    expect(chip.getAttribute('aria-pressed')).toBe('false');
    view.rerender(<Chip selected>Music</Chip>);
    expect(screen.getByRole('button', { name: 'Music' }).getAttribute('aria-pressed')).toBe('true');
  });

  it('[P1-06] labels status, loading, empty, and error states without relying on colour', () => {
    render(
      <>
        <Badge variant="verified">Verified</Badge>
        <Badge variant="live">Live now</Badge>
        <Badge variant="adult">18+</Badge>
        <Avatar name="Test Creator" status="online" />
        <Spinner label="Loading rooms" />
        <EmptyState title="No rooms">Check again soon.</EmptyState>
        <ErrorState title="Could not load">Check your connection.</ErrorState>
      </>,
    );
    expect(screen.getByText('Verified')).toBeTruthy();
    expect(screen.getByText('Live now')).toBeTruthy();
    expect(screen.getByRole('status', { name: 'Loading rooms' })).toBeTruthy();
    expect(screen.getByRole('img', { name: 'Test Creator, online' })).toBeTruthy();
    expect(screen.getByRole('alert').textContent).toContain('Could not load');
    expect(screen.getByRole('heading', { name: 'No rooms' })).toBeTruthy();
  });

  it('[P1-06] passes axe accessibility checks for representative controls and states', async () => {
    const { container } = render(
      <main>
        <Button>Continue</Button>
        <Input label="Email" type="email" />
        <Checkbox label="Accept safety rules" />
        <Switch label="Show online status" />
        <Badge variant="verified">Verified</Badge>
        <Avatar name="Test Creator" />
        <ErrorState title="Unable to continue">Try again.</ErrorState>
      </main>,
    );
    const results = await axe.run(container, { rules: { 'color-contrast': { enabled: false } } });
    expect(results.violations).toEqual([]);
  });
});
