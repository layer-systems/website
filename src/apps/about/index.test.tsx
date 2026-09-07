import { render, screen } from '@testing-library/react';
import { describe, expect, test, vi } from 'vitest';
import AboutApp from './index';

vi.mock('@/os/useWindowManager', () => ({
  useWindowManager: () => ({ openApp: vi.fn() }),
}));

describe('About app', () => {
  test('displays the package version', () => {
    render(<AboutApp setTitle={vi.fn()} />);

    expect(screen.getByText('Version 1.0.0')).toBeInTheDocument();
  });
});
