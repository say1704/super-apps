import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import Skeleton from '@/components/ui/Skeleton';

describe('Skeleton', () => {
  it('renders text variant by default', () => {
    const { container } = render(<Skeleton />);
    expect(container.querySelectorAll('.animate-pulse').length).toBeGreaterThan(0);
  });

  it('renders card variant with correct count', () => {
    const { container } = render(<Skeleton variant="card" count={4} />);
    expect(container.querySelectorAll('.rounded-lg').length).toBe(4);
  });

  it('renders table variant with correct rows', () => {
    const { container } = render(<Skeleton variant="table" rows={5} columns={4} />);
    // header row + 5 data rows = 6 flex rows
    expect(container.querySelectorAll('.flex').length).toBeGreaterThanOrEqual(6);
  });
});