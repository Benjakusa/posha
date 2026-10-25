import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { PageTransition, useMotionPreference } from './motion.js';

function MotionProbe() {
  const reduced = useMotionPreference();
  return <span>{String(reduced)}</span>;
}

beforeEach(() => localStorage.clear());
afterEach(cleanup);

describe('POSHA motion kit', () => {
  it('[B-S2-03] honors the in-app reduced-motion preference', () => {
    localStorage.setItem('posha:reduce-motion', 'true');
    render(<MotionProbe />);
    expect(screen.getByText('true')).toBeTruthy();
  });

  it('[B-S2-03] renders route changes with the shared transition class', () => {
    const { container } = render(<PageTransition>Content</PageTransition>);
    expect(container.firstElementChild?.classList.contains('page-transition')).toBe(true);
  });
});
