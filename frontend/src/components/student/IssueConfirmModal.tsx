import React from 'react';
import type { SACItem } from '../../types/index';
import { ShieldAlert, CheckCircle, ArrowRight, X } from 'lucide-react';

interface SelectedItemInfo {
  item: SACItem;
  qty: number;
}

interface IssueConfirmModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => void;
  selectedItems: SelectedItemInfo[];
  isLoading: boolean;
}

export const IssueConfirmModal: React.FC<IssueConfirmModalProps> = ({
  isOpen,
  onClose,
  onConfirm,
  selectedItems,
  isLoading
}) => {
  if (!isOpen) return null;

  const totalItems = selectedItems.reduce((acc, curr) => acc + curr.qty, 0);

  return (
    <div className="fixed inset-0 z-[100] bg-zinc-950/60 backdrop-blur-sm flex items-center justify-center p-4 animate-in fade-in duration-150">
      <div className="relative w-full max-w-lg bg-white border border-[#E4E4E7] rounded-3xl shadow-2xl p-6 text-zinc-900 overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between pb-4 border-b border-zinc-100">
          <div>
            <span className="text-[11px] font-bold uppercase tracking-wider text-blue-600 block">
              SAC Equipment Checkout
            </span>
            <h3 className="text-lg font-bold text-zinc-900 mt-0.5">
              Confirm 2-Minute Desk Arrival
            </h3>
          </div>
          <button
            onClick={onClose}
            disabled={isLoading}
            className="p-1.5 rounded-full text-zinc-400 hover:text-zinc-700 hover:bg-zinc-100 transition"
            aria-label="Close modal"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Step 1: Bundle Breakdown */}
        <div className="mt-4 space-y-2">
          <p className="text-xs text-zinc-500 font-medium">
            Requested equipment bundle:
          </p>
          <div className="bg-zinc-50 rounded-2xl p-3.5 border border-zinc-200/80 space-y-2">
            {selectedItems.map(({ item, qty }) => (
              <div
                key={item.id}
                className="flex items-center justify-between text-xs sm:text-sm py-1.5 border-b border-zinc-200/50 last:border-b-0"
              >
                <div className="flex items-center gap-2">
                  <CheckCircle className="w-4 h-4 text-emerald-600 flex-shrink-0" />
                  <span className="font-semibold text-zinc-900">{item.name}</span>
                  <span className="text-xs text-zinc-400">({item.category})</span>
                </div>
                <span className="font-mono font-bold text-blue-700 bg-blue-100/70 px-2.5 py-0.5 rounded-md border border-blue-200">
                  x{qty}
                </span>
              </div>
            ))}
            <div className="pt-2 text-right text-xs text-zinc-500 font-medium">
              Total Units: <strong className="text-zinc-900 font-mono">{totalItems}</strong>
            </div>
          </div>
        </div>

        {/* Step 2: Anti-Hoarding Policy Warning Banner */}
        <div className="mt-4 p-4 rounded-2xl bg-amber-50/80 border border-amber-200 text-amber-900">
          <div className="flex items-start gap-3">
            <ShieldAlert className="w-5 h-5 text-amber-600 flex-shrink-0 mt-0.5" />
            <div className="text-xs space-y-1">
              <span className="font-bold uppercase tracking-wider block text-amber-800">
                Authoritative 2:00 Countdown Warning
              </span>
              <p className="text-amber-900/90 leading-relaxed">
                Once submitted, a strict <strong>120-second arrival timer</strong> begins. You must present your student roll number to the SAC Guard Desk before the timer expires.
              </p>
              <p className="text-amber-800 font-semibold">
                ⚠️ Manual cancellation is disabled by SAC policy to deter slot hoarding. Letting 3 requests expire within 1 hour results in an automatic 5-hour cooldown.
              </p>
            </div>
          </div>
        </div>

        {/* Modal Actions */}
        <div className="mt-6 flex items-center justify-end gap-2.5 pt-4 border-t border-zinc-100">
          <button
            type="button"
            onClick={onClose}
            disabled={isLoading}
            className="px-4 py-2.5 rounded-xl text-xs font-semibold text-zinc-600 hover:text-zinc-900 hover:bg-zinc-100 transition"
          >
            Go Back
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={isLoading}
            className="px-5 py-2.5 rounded-xl text-xs font-bold text-white bg-zinc-900 hover:bg-zinc-800 active:scale-98 transition shadow-xs flex items-center gap-2 disabled:opacity-50"
          >
            {isLoading ? (
              'Submitting Request...'
            ) : (
              <>
                I Am at SAC Desk (Submit Request) <ArrowRight className="w-4 h-4" />
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
};
