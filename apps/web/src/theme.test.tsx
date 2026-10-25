import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { ThemeProvider, useTheme } from './theme.js';

function ThemeProbe() {
  const { theme, toggleTheme } = useTheme();
  return (
    <div>
      <span>{theme}</span>
      <button onClick={toggleTheme}>toggle</button>
    </div>
  );
}

beforeEach(() => {
  localStorage.clear();
  document.documentElement.dataset.theme = '';
});
afterEach(cleanup);

describe('POSHA theme', () => {
  it('[B-S2-01] uses dark mode by default and stores a manual toggle', async () => {
    render(
      <ThemeProvider>
        <ThemeProbe />
      </ThemeProvider>,
    );
    expect(screen.getByText('dark')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'toggle' }));
    expect(screen.getByText('light')).toBeTruthy();
    expect(localStorage.getItem('posha:theme')).toBe('light');
    await waitFor(() => expect(document.documentElement.dataset.theme).toBe('light'));
  });

  it('[B-S2-01] restores the saved theme', () => {
    localStorage.setItem('posha:theme', 'light');
    render(
      <ThemeProvider>
        <ThemeProbe />
      </ThemeProvider>,
    );
    expect(screen.getByText('light')).toBeTruthy();
  });
});
