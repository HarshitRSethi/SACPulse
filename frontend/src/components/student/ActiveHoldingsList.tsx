import React, { useState } from 'react';
import type { RegisterEntryUnit } from '../../types/index';
import { ArrowRightLeft, X } from 'lucide-react';

interface ActiveHoldingsListProps {
  holdings: RegisterEntryUnit[];
  currentStudentRollNo?: string | null;
  onInitiateTransfer: (entryId: string, recipientRollNo: string) => Promise<void>;
  onCancelTransfer: (entryId: string) => Promise<void>;
  isLoading: boolean;
}

export const ActiveHoldingsList: React.FC<ActiveHoldingsListProps> = ({
  holdings,
  currentStudentRollNo,
  onInitiateTransfer,
  onCancelTransfer,
  isLoading
}) => {
  const [selectedEntry, setSelectedEntry] = useState<RegisterEntryUnit | null>(null);
  const [recipientRollNo, setRecipientRollNo] = useState<string>('');
  const [transferError, setTransferError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);

  const handleOpenTransferModal = (entry: RegisterEntryUnit) => {
    setSelectedEntry(entry);
    setRecipientRollNo('');
    setTransferError(null);
  };

  const handleCloseTransferModal = () => {
    setSelectedEntry(null);
    setRecipientRollNo('');
    setTransferError(null);
  };

  const handleConfirmTransfer = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedEntry || !recipientRollNo.trim()) {
      setTransferError('Enter the recipient student roll number.');
      return;
    }
    if (recipientRollNo.trim().toUpperCase() === currentStudentRollNo?.toUpperCase()) {
      setTransferError('Cannot transfer an item to your own roll number.');
      return;
    }

    try {
      setIsSubmitting(true);
      setTransferError(null);
      await onInitiateTransfer(selectedEntry.id, recipientRollNo.trim().toUpperCase());
      handleCloseTransferModal();
    } catch (err: any) {
      setTransferError(err.message || 'Failed to initiate transfer.');
    } finally {
      setIsSubmitting(false);
    }
  };

  if (holdings.length === 0) {
    return null;
  }

  return (
    <section className="bg-white border border-zinc-200 rounded-lg overflow-hidden">
      <div className="px-4 py-2.5 bg-zinc-50/70 border-b border-zinc-200 flex items-center justify-between">
        <h2 className="text-xs font-semibold text-zinc-800">
          Your Active Holdings ({holdings.length})
        </h2>
        <span className="text-[11px] text-zinc-500">
          Peer-to-peer transfer eligible
        </span>
      </div>

      <div className="divide-y divide-zinc-100">
        {holdings.map((unit) => {
          const isPendingTransfer = unit.status === 'ISSUED_TRANSFER_PENDING';

          return (
            <div
              key={unit.id}
              className="px-4 py-3 flex flex-col sm:flex-row sm:items-center justify-between gap-2.5"
            >
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <span className="text-xs font-semibold text-zinc-900">
                    {unit.itemName}
                  </span>
                  <span className="text-[11px] text-zinc-400">·</span>
                  <span className="text-xs text-zinc-500">{unit.category}</span>
                  <span className="font-mono text-[10px] text-zinc-400">
                    #{unit.id.slice(0, 8)}
                  </span>
                </div>
              </div>

              <div className="flex items-center justify-between sm:justify-end gap-3">
                <span className="inline-flex items-center gap-1.5 text-xs">
                  <span
                    className={`h-1.5 w-1.5 rounded-full ${
                      isPendingTransfer ? 'bg-amber-500' : 'bg-emerald-500'
                    }`}
                  />
                  <span className={isPendingTransfer ? 'text-amber-800' : 'text-zinc-600'}>
                    {isPendingTransfer ? 'Awaiting peer acceptance' : 'In possession'}
                  </span>
                </span>

                {isPendingTransfer ? (
                  <button
                    type="button"
                    disabled={isLoading}
                    onClick={() => onCancelTransfer(unit.id)}
                    className="px-2.5 py-1 rounded-md text-xs font-medium border border-zinc-200 bg-white hover:bg-zinc-50 text-zinc-700 transition"
                  >
                    Cancel transfer
                  </button>
                ) : (
                  <button
                    type="button"
                    disabled={isLoading}
                    onClick={() => handleOpenTransferModal(unit)}
                    className="px-2.5 py-1 rounded-md text-xs font-medium bg-zinc-900 hover:bg-zinc-800 text-white transition inline-flex items-center gap-1.5"
                  >
                    <ArrowRightLeft className="w-3 h-3" />
                    <span>Transfer</span>
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* Peer Transfer Modal */}
      {selectedEntry && (
        <div className="fixed inset-0 z-[100] bg-zinc-950/50 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="relative w-full max-w-md bg-white border border-zinc-200 rounded-xl shadow-xl p-6 text-zinc-900">
            <button
              type="button"
              onClick={handleCloseTransferModal}
              className="absolute top-4 right-4 p-1 rounded-md hover:bg-zinc-100 text-zinc-400 hover:text-zinc-700"
              aria-label="Close"
            >
              <X className="w-4 h-4" />
            </button>

            <h3 className="text-base font-semibold text-zinc-900">
              Transfer {selectedEntry.itemName}
            </h3>
            <p className="text-xs text-zinc-500 mt-1 leading-relaxed">
              Enter the recipient&apos;s IIITA roll number. Responsibility transfers
              atomically once they accept on their dashboard.
            </p>

            <form onSubmit={handleConfirmTransfer} className="mt-4 space-y-4">
              <div>
                <label className="block text-xs font-medium text-zinc-700 mb-1.5">
                  Recipient Roll Number
                </label>
                <input
                  type="text"
                  value={recipientRollNo}
                  onChange={(e) => setRecipientRollNo(e.target.value.toUpperCase())}
                  placeholder="e.g. IIT2023002"
                  autoFocus
                  className="w-full bg-white border border-zinc-300 rounded-lg px-3 py-2 text-xs text-zinc-900 placeholder:text-zinc-400 focus:outline-none focus:border-zinc-900 uppercase font-mono"
                />
              </div>

              {transferError && (
                <p className="text-xs text-red-700 bg-red-50 p-2.5 rounded-lg border border-red-200">
                  {transferError}
                </p>
              )}

              <div className="flex items-center justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={handleCloseTransferModal}
                  disabled={isSubmitting}
                  className="px-3.5 py-2 rounded-lg text-xs font-medium text-zinc-600 hover:bg-zinc-100 transition"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting || !recipientRollNo.trim()}
                  className="px-4 py-2 rounded-lg text-xs font-medium text-white bg-zinc-900 hover:bg-zinc-800 disabled:opacity-50 transition"
                >
                  {isSubmitting ? 'Sending...' : 'Send Transfer'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </section>
  );
};
