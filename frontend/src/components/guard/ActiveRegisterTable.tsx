import React, { useMemo } from 'react';
import type { ActiveBatch } from '../../types/index';
import { AlertTriangle, Phone, RotateCcw, Search, X } from 'lucide-react';

interface ActiveRegisterTableProps {
  batches: ActiveBatch[];
  searchQuery: string;
  onSearchChange: (q: string) => void;
  onReturnUnitIntact: (entryId: string) => void;
  onReturnBatchIntact: (batchId: string) => void;
  onReturnUnitDamaged: (entryId: string) => void;
  isLoading: boolean;
}

export const ActiveRegisterTable: React.FC<ActiveRegisterTableProps> = ({
  batches,
  searchQuery,
  onSearchChange,
  onReturnUnitIntact,
  onReturnBatchIntact,
  onReturnUnitDamaged,
  isLoading
}) => {
  const filteredBatches = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return batches;
    return batches.filter(
      (b) =>
        b.studentName.toLowerCase().includes(q) ||
        b.rollNo.toLowerCase().includes(q) ||
        (b.mobileNo || '').toLowerCase().includes(q) ||
        b.units.some((u) => u.itemName.toLowerCase().includes(q))
    );
  }, [batches, searchQuery]);

  const totalActiveUnits = useMemo(
    () => batches.reduce((sum, b) => sum + b.units.length, 0),
    [batches]
  );

  const formatTime = (iso: string) => {
    const d = new Date(iso);
    if (isNaN(d.getTime())) return '';
    return d.toLocaleTimeString([], {
      hour: '2-digit',
      minute: '2-digit',
      hour12: true
    });
  };

  return (
    <section className="space-y-2.5">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
        <div>
          <h2 className="text-xs font-semibold uppercase tracking-wider text-zinc-600">
            Active Issued Register ({totalActiveUnits} units · {batches.length} holders)
          </h2>
        </div>

        <div className="relative w-full sm:w-64">
          <Search className="w-3.5 h-3.5 text-zinc-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => onSearchChange(e.target.value)}
            placeholder="Search roll no, name, item..."
            className="w-full h-8 bg-white border border-zinc-200 rounded-md pl-8 pr-7 text-xs text-zinc-900 placeholder:text-zinc-400 focus:outline-none focus:border-zinc-900"
          />
          {searchQuery && (
            <button
              onClick={() => onSearchChange('')}
              className="absolute right-2 top-1/2 -translate-y-1/2 text-zinc-400 hover:text-zinc-700"
              aria-label="Clear filter"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
      </div>

      {filteredBatches.length === 0 ? (
        <div className="bg-white border border-zinc-200 rounded-lg p-8 text-center">
          <p className="text-xs font-medium text-zinc-700">
            {batches.length === 0
              ? 'No items currently checked out'
              : 'No active holdings match your filter'}
          </p>
          <p className="text-[11px] text-zinc-500 mt-0.5">
            {batches.length === 0
              ? 'All SAC equipment and room keys are accounted for at the desk.'
              : 'Try searching by roll number or clearing the search box.'}
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {filteredBatches.map((batch) => (
            <div
              key={`${batch.batchId}::${batch.studentId}`}
              className="bg-white border border-zinc-200 rounded-lg overflow-hidden"
            >
              {/* Batch Header */}
              <div className="px-4 py-2.5 bg-zinc-50/80 border-b border-zinc-200 flex flex-wrap items-center justify-between gap-2">
                <div className="flex flex-wrap items-center gap-2 text-xs">
                  <span className="font-semibold text-zinc-900">
                    {batch.studentName}
                  </span>
                  <span className="font-mono text-[11px] px-1.5 py-0.5 rounded bg-white text-zinc-700 border border-zinc-200">
                    {batch.rollNo}
                  </span>
                  {batch.mobileNo && batch.mobileNo !== 'N/A' && (
                    <a
                      href={`tel:${batch.mobileNo}`}
                      className="inline-flex items-center gap-1 font-mono text-[11px] tabular-nums text-zinc-600 hover:text-zinc-900 px-1.5 py-0.5 rounded border border-zinc-200 bg-white"
                      title={`Call ${batch.studentName}`}
                    >
                      <Phone className="w-3 h-3" />
                      <span>{batch.mobileNo}</span>
                    </a>
                  )}
                  <span className="text-[11px] text-zinc-400 tabular-nums">
                    Issued {formatTime(batch.arrivalTime)}
                  </span>
                </div>

                {batch.units.length > 1 && (
                  <button
                    onClick={() => onReturnBatchIntact(batch.batchId)}
                    disabled={isLoading}
                    className="px-2.5 py-1 rounded-md text-xs font-medium bg-zinc-900 hover:bg-zinc-800 text-white transition disabled:opacity-50 inline-flex items-center gap-1"
                  >
                    <RotateCcw className="w-3 h-3" />
                    <span>Return All ({batch.units.length})</span>
                  </button>
                )}
              </div>

              {/* Per-Unit Rows */}
              <div className="divide-y divide-zinc-100">
                {batch.units.map((unit) => {
                  const isTransferPending = unit.status === 'ISSUED_TRANSFER_PENDING';
                  return (
                    <div
                      key={unit.id}
                      className="px-4 py-2.5 flex flex-col sm:flex-row sm:items-center justify-between gap-2"
                    >
                      <div className="flex items-center gap-2 min-w-0">
                        <span className="text-xs font-medium text-zinc-900">
                          {unit.itemName}
                        </span>
                        <span className="text-[11px] text-zinc-400">·</span>
                        <span className="text-xs text-zinc-500">{unit.category}</span>
                        <span className="font-mono text-[10px] text-zinc-400">
                          #{unit.id.slice(0, 6)}
                        </span>
                        {isTransferPending && (
                          <span className="text-[10px] px-1.5 py-0.5 rounded bg-amber-50 text-amber-800 border border-amber-200">
                            Transfer pending
                          </span>
                        )}
                      </div>

                      <div className="flex items-center gap-2 self-end sm:self-auto">
                        <button
                          onClick={() => onReturnUnitIntact(unit.id)}
                          disabled={isLoading}
                          className="px-2.5 py-1 rounded-md text-xs font-medium border border-zinc-200 bg-white hover:bg-zinc-50 text-zinc-800 transition disabled:opacity-50"
                        >
                          Return Intact
                        </button>
                        <button
                          onClick={() => onReturnUnitDamaged(unit.id)}
                          disabled={isLoading}
                          className="px-2.5 py-1 rounded-md text-xs font-medium border border-red-200 bg-red-50/70 hover:bg-red-100 text-red-700 transition disabled:opacity-50 inline-flex items-center gap-1"
                          title="Mark unit damaged and lock student as defaulter"
                        >
                          <AlertTriangle className="w-3 h-3" />
                          <span>Damaged</span>
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      )}
    </section>
  );
};

