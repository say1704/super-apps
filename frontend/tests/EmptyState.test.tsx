import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import EmptyState from '@/components/ui/EmptyState';

describe('EmptyState', () => {
  it('renders title', () => {
    render(<EmptyState title="No data found" />);
    expect(screen.getByText('No data found')).toBeInTheDocument();
  });

  it('renders description when provided', () => {
    render(<EmptyState title="No data found" description="Try adjusting filters" />);
    expect(screen.getByText('Try adjusting filters')).toBeInTheDocument();
  });

  it('renders icon when provided', () => {
    render(<EmptyState title="No data" icon="📋" />);
    expect(screen.getByText('📋')).toBeInTheDocument();
  });

  it('renders action button when provided', () => {
    const onClick = () => {};
    render(<EmptyState title="No data" action={{ label: 'Create', onClick }} />);
    expect(screen.getByText('Create')).toBeInTheDocument();
  });

  it('does not render description by default', () => {
    render(<EmptyState title="No data" />);
    expect(screen.queryByText('Try adjusting')).not.toBeInTheDocument();
  });
});