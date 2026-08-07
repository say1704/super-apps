import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { Modal } from '@/components/ui';

describe('Modal', () => {
  it('does not render when closed', () => {
    render(<Modal isOpen={false} onClose={() => {}} title="Test">Content</Modal>);
    expect(screen.queryByText('Test')).not.toBeInTheDocument();
  });

  it('renders title and children when open', () => {
    render(<Modal isOpen={true} onClose={() => {}} title="Test Modal">Hello World</Modal>);
    expect(screen.getByText('Test Modal')).toBeInTheDocument();
    expect(screen.getByText('Hello World')).toBeInTheDocument();
  });

  it('renders close button when open', () => {
    render(<Modal isOpen={true} onClose={() => {}} title="Test">Content</Modal>);
    expect(screen.getByText('✕')).toBeInTheDocument();
  });
});