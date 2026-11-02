import type { MasterLogRow } from '../../domain/repositories/IRegisterLogRepository.js';

/**
 * CsvExportFormatter
 *
 * SOLID Single Responsibility Principle (SRP):
 * Extracted out of persistence repositories so presentation/export serialization
 * remains cleanly separated from data access.
 */
export class CsvExportFormatter {
  private static readonly HEADERS = [
    'Entry ID',
    'Batch ID',
    'Student Name',
    'Roll Number',
    'Mobile Number',
    'Item Name',
    'Category',
    'Status',
    'Arrival Time',
    'Departure Time'
  ] as const;

  public static formatMasterLogs(rows: readonly MasterLogRow[]): string {
    const escapeCell = (val: unknown): string => {
      if (val === null || val === undefined) return '';
      const str = String(val);
      if (str.includes(',') || str.includes('"') || str.includes('\n') || str.includes('\r')) {
        return `"${str.replace(/"/g, '""')}"`;
      }
      return str;
    };

    const lines: string[] = [CsvExportFormatter.HEADERS.join(',')];
    for (const row of rows) {
      lines.push(
        [
          row.id,
          row.batch_id,
          row.student_name,
          row.roll_no,
          row.mobile_no,
          row.item_name,
          row.category,
          row.status,
          row.arrival_time,
          row.departure_time || ''
        ]
          .map(escapeCell)
          .join(',')
      );
    }

    return lines.join('\n');
  }
}

