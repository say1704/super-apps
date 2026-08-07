import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { DataTable } from '@/components/page-container';

const columns = [
  { key: 'name', label: 'Name' },
  { key: 'role', label: 'Role' },
];

const data = [
  { id: 1, name: 'Alice', role: 'Admin' },
  { id: 2, name: 'Bob', role: 'User' },
];

describe('DataTable (page-container)', () => {
  it('renders table headers', () => {
    render(<DataTable columns={columns} data={data} />);
    expect(screen.getByText('Name')).toBeInTheDocument();
    expect(screen.getByText('Role')).toBeInTheDocument();
  });

  it('renders data rows', () => {
    render(<DataTable columns={columns} data={data} />);
    expect(screen.getByText('Alice')).toBeInTheDocument();
    expect(screen.getByText('Bob')).toBeInTheDocument();
  });

  it('shows loading spinner when loading', () => {
    render(<DataTable columns={columns} data={data} loading={true} />);
    expect(screen.getByText('Loading data...')).toBeInTheDocument();
  });

  it('shows empty state when no data', () => {
    render(<DataTable columns={columns} data={[]} />);
    expect(screen.getByText('No data available')).toBeInTheDocument();
  });

  it('shows action buttons when handlers provided', () => {
    const { container } = render(<DataTable columns={columns} data={data} onEdit={() => {}} onDelete={() => {}} />);
    const buttons = container.querySelectorAll('button');
    expect(buttons.length).toBeGreaterThanOrEqual(2);
  });
});