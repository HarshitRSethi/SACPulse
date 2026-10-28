import React, { useState } from 'react';
import type { RegisterEntryUnit } from '../../types/index';
import { ArrowRightLeft, Clock, ShieldCheck, XCircle, Search, UserCheck } from 'lucide-react';

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

  // Quick preset suggestion for demo
  const suggestedPeer = currentStudentRollNo === 'IIT2023001'
    ? { rollNo: 'IIT2023002', name: 'Student B' }
    : { rollNo: 'IIT2023001', name: 'Student A' };

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

  const handleConfirmTransfer = async () => {
    if (!selectedEntry || !recipientRollNo.trim()) {
      setTransferError('Please enter a recipient Roll Number');
      return;
    }
    if (recipientRollNo.trim().toUpperCase() === currentStudentRollNo?.toUpperCase()) {
      setTransferError('Cannot transfer equipment to yourself');
      return;
    }

    try {
      setIsSubmitting(true);
      setTransferError(null);
      await onInitiateTransfer(selectedEntry.id, recipientRollNo.trim().toUpperCase());
      handleCloseTransferModal();
    } catch (err: any) {
      setTransferError(err.message || 'Failed to initiate transfer');
    } finally {
      setIsSubmitting(false);
    }
  };

  if (holdings.length === 0) {
    return (
      <div className="rounded-2xl p-6 bg-white border border-[#E4E4E7] text-center shadow-xs">
        <ShieldCheck className="w-8 h-8 text-zinc-400 mx-auto mb-2" />
        <h2 className="text-sm font-bold text-zinc-800">No Active Holdings</h2>
        <p className="text-xs text-zinc-500 mt-1">
          You currently have no equipment or room keys checked out from the SAC counter.
        </p>
      </div>
    );
  }

  return (
    <section className="space-y-3">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-bold uppercase tracking-wider text-zinc-700 flex items-center gap-2">
          <ShieldCheck className="w-4 h-4 text-emerald-600" />
          Active Issued Items ({holdings.length})
        </h2>
        <span className="text-xs text-zinc-500 font-medium">
          Peer-to-peer transfer enabled
        </span>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
        {holdings.map((unit) => {
          const isPendingTransfer = unit.status === 'ISSUED_TRANSFER_PENDING';

          return (
            <div
              key={unit.id}
              className={`rounded-2xl p-4 sm:p-5 border transition-all flex flex-col justify-between ${
                isPendingTransfer
                  ? 'bg-amber-50/70 border-amber-200 shadow-xs'
                  : 'bg-white border-[#E4E4E7] hover:border-zinc-300 shadow-xs hover:shadow-md'
              }`}
            >
              <div>
                <div className="flex items-start justify-between gap-2 mb-2">
                  <span className="text-[11px] font-semibold text-zinc-600 px-2.5 py-0.5 rounded-full bg-zinc-100 border border-zinc-200">
                    {unit.category}
                  </span>

                  {isPendingTransfer ? (
                    <span className="inline-flex items-center gap-1 text-[11px] font-semibold px-2 py-0.5 rounded-full bg-amber-100 text-amber-800 border border-amber-200">
                      <Clock className="w-3 h-3 text-amber-600" /> Transfer Pending
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1 text-[11px] font-semibold px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200">
                      In Possession
                    </span>
                  )}
                </div>

                <h3 className="font-bold text-base text-zinc-900">
                  {unit.itemName}
                </h3>
                <p className="text-xs text-zinc-400 font-mono mt-1">
                  Unit ID: {unit.id.slice(0, 8)}...
                </p>
              </div>

              {/* Action Buttons */}
              <div className="mt-4 pt-3 border-t border-zinc-100 flex items-center justify-between">
                {isPendingTransfer ? (
                  <>
                    <span className="text-xs text-amber-800/90 font-medium italic">
                      Awaiting recipient response...
                    </span>
                    <button
                      type="button"
                      disabled={isLoading}
                      onClick={() => onCancelTransfer(unit.id)}
                      className="px-3 py-1.5 rounded-xl text-xs font-semibold bg-white hover:bg-zinc-100 text-zinc-700 border border-zinc-200 transition flex items-center gap-1.5 shadow-xs"
                    >
                      <XCircle className="w-3.5 h-3.5 text-rose-600" /> Cancel Transfer
                    </button>
                  </>
                ) : (
                  <>
                    <span className="text-xs text-zinc-500 font-medium">
                      On-court handover?
                    </span>
                    <button
                      type="button"
                      disabled={isLoading}
                      onClick={() => handleOpenTransferModal(unit)}
                      className="px-3.5 py-1.5 rounded-xl text-xs font-bold bg-zinc-900 hover:bg-zinc-800 text-white shadow-xs transition flex items-center gap-1.5 active:scale-95"
                    >
                      <ArrowRightLeft className="w-3.5 h-3.5" /> Initiate Transfer
                    </button>
                  </>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* Initiate Transfer Modal */}
      {selectedEntry && (
        <div className="fixed inset-0 z-[100] bg-zinc-950/60 backdrop-blur-sm flex items-center justify-center p-4 animate-in fade-in duration-150">
          <div className="relative w-full max-w-md bg-white border border-[#E4E4E7] rounded-3xl shadow-2xl p-6 text-zinc-900">
            <h3 className="text-base font-bold text-zinc-900 flex items-center gap-2">
              <ArrowRightLeft className="w-4 h-4 text-blue-600" />
              Transfer {selectedEntry.itemName}
            </h3>
            <p className="text-xs text-zinc-500 mt-1">
              Hand off this item directly to another student on campus without returning to the SAC desk.
            </p>

            {/* Quick Peer Shortcut */}
            <div className="mt-4 p-3.5 rounded-2xl bg-zinc-50 border border-zinc-200 flex items-center justify-between">
              <div>
                <span className="text-[11px] text-zinc-500 font-semibold uppercase tracking-wider">Quick Pick (Demo Peer)</span>
                <div className="text-xs font-bold text-zinc-900 flex items-center gap-1.5 mt-0.5">
                  <UserCheck className="w-3.5 h-3.5 text-blue-600" />
                  {suggestedPeer.name} ({suggestedPeer.rollNo})
                </div>
              </div>
              <button
                type="button"
                onClick={() => setRecipientRollNo(suggestedPeer.rollNo)}
                className="px-3 py-1 text-xs font-bold rounded-lg bg-zinc-900 hover:bg-zinc-800 text-white transition shadow-xs"
              >
                Select
              </button>
            </div>

            {/* Manual Roll No Input */}
            <div className="mt-4 space-y-1.5">
              <label className="text-xs font-bold text-zinc-700">
                Recipient Roll Number
              </label>
              <div className="relative">
                <Search className="w-4 h-4 text-zinc-400 absolute left-3 top-2.5" />
                <input
                  type="text"
                  value={recipientRollNo}
                  onChange={(e) => setRecipientRollNo(e.target.value.toUpperCase())}
                  placeholder="e.g. IIT2023002"
                  className="w-full bg-white border border-zinc-200 rounded-xl pl-9 pr-4 py-2 text-sm text-zinc-900 placeholder-zinc-400 focus:outline-none focus:ring-2 focus:ring-blue-600/20 focus:border-blue-600 uppercase font-mono shadow-xs"
                />
              </div>
            </div>

            {transferError && (
              <p className="text-xs text-rose-600 mt-2 bg-rose-50 p-2.5 rounded-xl border border-rose-200 font-medium">
                {transferError}
              </p>
            )}

            <div className="mt-6 flex items-center justify-end gap-2.5">
              <button
                type="button"
                onClick={handleCloseTransferModal}
                disabled={isSubmitting}
                className="px-4 py-2 rounded-xl text-xs font-semibold text-zinc-600 hover:text-zinc-900 hover:bg-zinc-100 transition"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleConfirmTransfer}
                disabled={isSubmitting || !recipientRollNo.trim()}
                className="px-4 py-2 rounded-xl text-xs font-bold text-white bg-blue-600 hover:bg-blue-500 disabled:opacity-50 transition shadow-xs flex items-center gap-1.5"
              >
                {isSubmitting ? 'Transferring...' : 'Send Transfer Request'}
              </button>
            </div>
          </div>
        </div>
      )}
    </section>
  );
};
