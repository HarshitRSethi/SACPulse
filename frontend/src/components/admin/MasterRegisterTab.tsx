import React, { useMemo } from 'react';
import {
  ChevronLeft,
  ChevronRight,
  Download,
  Phone,
  Search,
  X
} from 'lucide-react';

interface MasterRegisterTabProps {
  logs: any[];
  statusFilter: string;
  onStatusFilterChange: (status: string) => void;
  searchQuery: string;
  onSearchQueryChange: (q: string) => void;
  currentPage: number;
  totalPages: number;
  totalCount: number;
  onPageChange: (page: number) => void;
  onExportCsv: () => void;
  isExportingCsv?: boolean;
}

const STATUS_OPTIONS = [
  { value: 'ALL', label: 'All Statuses' },
  { value: 'ISSUED', label: 'Issued' },
  { value: 'ISSUED_TRANSFER_PENDING', label: 'Transfer Pending' },
  { value: 'RETURNED', label: 'Returned' },
  { value: 'RETURNED_VIA_TRANSFER', label: 'Transferred' },
  { value: 'DAMAGED', label: 'Damaged' }
];

function renderStatusBadge(status: string) {
  switch (status) {
    case 'ISSUED':
      return (
        <span className="inline-flex items-center gap-1.5 text-xs text-zinc-800">
          <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
          Issued
        </span>
      );
    case 'ISSUED_TRANSFER_PENDING':
      return (
        <span className="inline-flex items-center gap-1.5 text-xs text-amber-800">
          <span className="h-1.5 w-1.5 rounded-full bg-amber-500" />
          Transfer Pending
        </span>
      );
    case 'RETURNED_VIA_TRANSFER':
      return (
        <span className="inline-flex items-center gap-1.5 text-xs text-zinc-600">
          <span className="h-1.5 w-1.5 rounded-full bg-blue-500" />
          Transferred
        </span>
      );
    case 'DAMAGED':
      return (
        <span className="inline-flex items-center gap-1.5 text-xs font-medium text-red-700">
          <span className="h-1.5 w-1.5 rounded-full bg-red-500" />
          Damaged
        </span>
      );
    default:
      return (
        <span className="inline-flex items-center gap-1.5 text-xs text-zinc-500">
          <span className="h-1.5 w-1.5 rounded-full bg-zinc-400" />
          Returned
        </span>
      );
  }
}

export const MasterRegisterTab: React.FC<MasterRegisterTabProps> = ({
  logs,
  statusFilter,
  onStatusFilterChange,
  searchQuery,
  onSearchQueryChange,
  currentPage,
  totalPages,
  totalCount,
  onPageChange,
  onExportCsv,
  isExportingCsv = false
}) => {
  const filteredLogs = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return logs;
    return logs.filter(
      (l) =>
        (l.student_name || '').toLowerCase().includes(q) ||
        (l.roll_no || '').toLowerCase().includes(q) ||
        (l.item_name || '').toLowerCase().includes(q) ||
        (l.category || '').toLowerCase().includes(q) ||
        (l.batch_id || '').toLowerCase().includes(q)
    );
  }, [logs, searchQuery]);

  const formatDateTime = (iso?: string | null) => {
    if (!iso) return '—';
    const d = new Date(iso);
    if (isNaN(d.getTime())) return '—';
    return d.toLocaleString([], {
      month: 'short',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      hour12: true
    });
  };

  return (
    <div className="space-y-3">
      {/* Toolbar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5">
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative w-full sm:w-64">
            <Search className="w-3.5 h-3.5 text-zinc-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => onSearchQueryChange(e.target.value)}
              placeholder="Filter current page..."
              className="w-full h-8 bg-white border border-zinc-200 rounded-md pl-8 pr-7 text-xs text-zinc-900 placeholder:text-zinc-400 focus:outline-none focus:border-zinc-900"
            />
            {searchQuery && (
              <button
                onClick={() => onSearchQueryChange('')}
                className="absolute right-2 top-1/2 -translate-y-1/2 text-zinc-400 hover:text-zinc-700"
                aria-label="Clear search"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>

          <select
            value={statusFilter}
            onChange={(e) => onStatusFilterChange(e.target.value)}
            aria-label="Filter by status"
            className="h-8 bg-white border border-zinc-200 rounded-md px-2.5 text-xs text-zinc-800 focus:outline-none focus:border-zinc-900"
          >
            {STATUS_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
        </div>

        <button
          onClick={onExportCsv}
          disabled={isExportingCsv}
          className="h-8 px-3 rounded-md text-xs font-medium bg-zinc-900 hover:bg-zinc-800 text-white transition inline-flex items-center gap-1.5 self-start sm:self-auto disabled:opacity-50"
        >
          <Download className="w-3.5 h-3.5" />
          <span>{isExportingCsv ? 'Exporting...' : 'Export CSV'}</span>
        </button>
      </div>

      {/* Table */}
      <div className="bg-white border border-zinc-200 rounded-lg overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-zinc-50/80 border-b border-zinc-200 text-[11px] font-semibold uppercase tracking-wider text-zinc-500">
                <th className="py-2.5 px-3.5">Student</th>
                <th className="py-2.5 px-3.5">Item</th>
                <th className="py-2.5 px-3.5">Batch</th>
                <th className="py-2.5 px-3.5">Status</th>
                <th className="py-2.5 px-3.5">Issued At</th>
                <th className="py-2.5 px-3.5">Closed At</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-100 text-xs">
              {filteredLogs.length === 0 ? (
                <tr>
                  <td colSpan={6} className="py-10 text-center text-zinc-500">
                    No register entries match the current filter.
                  </td>
                </tr>
              ) : (
                filteredLogs.map((row) => (
                  <tr key={row.id} className="hover:bg-zinc-50/60 transition">
                    <td className="py-2.5 px-3.5">
                      <div className="font-medium text-zinc-900">
                        {row.student_name}
                      </div>
                      <div className="flex items-center gap-2 text-[11px] text-zinc-500 font-mono">
                        <span>{row.roll_no}</span>
                        {row.mobile_no && row.mobile_no !== 'N/A' && (
                          <a
                            href={`tel:${row.mobile_no}`}
                            className="inline-flex items-center gap-0.5 text-zinc-500 hover:text-zinc-900 tabular-nums"
                          >
                            <Phone className="w-2.5 h-2.5" />
                            {row.mobile_no}
                          </a>
                        )}
                      </div>
                    </td>
                    <td className="py-2.5 px-3.5">
                      <div className="font-medium text-zinc-900">{row.item_name}</div>
                      <div className="text-[11px] text-zinc-500">{row.category}</div>
                    </td>
                    <td className="py-2.5 px-3.5 font-mono text-[11px] text-zinc-500">
                      {String(row.batch_id || '').slice(0, 8)}
                    </td>
                    <td className="py-2.5 px-3.5">{renderStatusBadge(row.status)}</td>
                    <td className="py-2.5 px-3.5 text-zinc-600 tabular-nums whitespace-nowrap">
                      {formatDateTime(row.arrival_time)}
                    </td>
                    <td className="py-2.5 px-3.5 text-zinc-500 tabular-nums whitespace-nowrap">
                      {formatDateTime(row.departure_time)}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination Footer */}
        <div className="px-4 py-2.5 bg-zinc-50/70 border-t border-zinc-200 flex items-center justify-between text-xs text-zinc-600">
          <span className="tabular-nums">
            Page <strong>{currentPage}</strong> of <strong>{totalPages}</strong> ({totalCount}{' '}
            entries)
          </span>

          <div className="flex items-center gap-1.5">
            <button
              onClick={() => onPageChange(Math.max(1, currentPage - 1))}
              disabled={currentPage <= 1}
              className="px-2 py-1 rounded border border-zinc-200 bg-white hover:bg-zinc-50 disabled:opacity-40 transition inline-flex items-center gap-1"
            >
              <ChevronLeft className="w-3.5 h-3.5" />
              <span>Prev</span>
            </button>
            <button
              onClick={() => onPageChange(Math.min(totalPages, currentPage + 1))}
              disabled={currentPage >= totalPages}
              className="px-2 py-1 rounded border border-zinc-200 bg-white hover:bg-zinc-50 disabled:opacity-40 transition inline-flex items-center gap-1"
            >
              <span>Next</span>
              <ChevronRight className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

