import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import LoadingSpinner from '@/components/ui/LoadingSpinner';

describe('LoadingSpinner', () => {
  it('renders with default size', () => {
    render(<LoadingSpinner />);
    const spinner = document.querySelector('.animate-spin');
    expect(spinner).toBeInTheDocument();
    expect(spinner).toHaveClass('h-8');
  });

  it('renders with label', () => {
    render(<LoadingSpinner label="Loading tasks..." />);
    expect(screen.getByText('Loading tasks...')).toBeInTheDocument();
  });

  it('renders with sm size', () => {
    render(<LoadingSpinner size="sm" />);
    expect(document.querySelector('.animate-spin')).toHaveClass('h-6');
  });

  it('renders with lg size', () => {
    render(<LoadingSpinner size="lg" />);
    expect(document.querySelector('.animate-spin')).toHaveClass('h-12');
  });

  it('renders without label by default', () => {
    render(<LoadingSpinner />);
    expect(screen.queryByRole('paragraph')).not.toBeInTheDocument();
  });
});