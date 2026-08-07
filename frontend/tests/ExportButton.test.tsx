import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import ExportButton from '@/components/ExportButton';

const sampleData = [
  { id: 1, name: 'Test' },
  { id: 2, name: 'Test 2' },
];

const sampleColumns = [
  { key: 'id', label: 'ID' },
  { key: 'name', label: 'Name' },
];

describe('ExportButton', () => {
  it('renders export button', () => {
    render(<ExportButton data={sampleData} filename="test" columns={sampleColumns} title="Test Data" />);
    expect(screen.getByText('Export')).toBeInTheDocument();
  });
});