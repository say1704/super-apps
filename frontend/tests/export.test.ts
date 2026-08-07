import { describe, it, expect, vi, beforeEach } from 'vitest';
import { exportToExcel, exportToPDF, printTable } from '@/lib/export';

const sampleData = [
  { id: 1, name: 'Test Item', status: 'active' },
];

beforeEach(() => {
  vi.restoreAllMocks();
});

describe('exportToExcel', () => {
  it('should generate an XLSX file without throwing', async () => {
    const mockCreate = vi.fn(() => 'blob:mock');
    const mockRevoke = vi.fn();
    vi.stubGlobal('URL', { ...URL, createObjectURL: mockCreate, revokeObjectURL: mockRevoke });
    await expect(exportToExcel(sampleData, 'test')).resolves.toBeUndefined();
    expect(mockCreate).toHaveBeenCalled();
    expect(mockRevoke).toHaveBeenCalled();
  });
});

describe('exportToPDF', () => {
  it('should generate a PDF without throwing', () => {
    expect(() => exportToPDF(sampleData, 'test', 'Test Title')).not.toThrow();
  });
});

describe('printTable', () => {
  it('should open a print window', () => {
    vi.useFakeTimers();
    const mockWrite = vi.fn();
    const mockClose = vi.fn();
    const mockFocus = vi.fn();
    const mockPrint = vi.fn();
    const mockOpen = vi.fn(() => ({
      document: { write: mockWrite, close: mockClose },
      close: mockClose,
      focus: mockFocus,
      print: mockPrint,
    }));
    vi.stubGlobal('open', mockOpen);

    printTable(sampleData, 'Test Table');
    expect(mockOpen).toHaveBeenCalled();
    vi.advanceTimersByTime(300);
    expect(mockPrint).toHaveBeenCalled();
    vi.useRealTimers();
  });
});