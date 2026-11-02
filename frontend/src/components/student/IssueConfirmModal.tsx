import React, { useEffect } from 'react';
import { createPortal } from 'react-dom';
import type { SACItem } from '../../types/index';
import { X } from 'lucide-react';

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
  useEffect(() => {
    document.body.style.overflow = isOpen ? 'hidden' : '';
    return () => {
      document.body.style.overflow = '';
    };
  }, [isOpen]);

  if (!isOpen) return null;

  const totalItems = selectedItems.reduce((acc, curr) => acc + curr.qty, 0);

  return createPortal(
    <div
      onClick={(e) => {
        if (e.target === e.currentTarget && !isLoading) onClose();
      }}
      className="fixed inset-0 z-[999] bg-zinc-950/50 backdrop-blur-xs flex items-center justify-center p-4"
    >
      <div className="relative w-full max-w-md bg-white border border-zinc-200 rounded-xl shadow-xl p-6 text-zinc-900">
        <div className="flex items-start justify-between pb-3.5 border-b border-zinc-100">
          <div>
            <h3 className="text-base font-semibold text-zinc-900">
              Confirm Counter Pickup
            </h3>
            <p className="text-xs text-zinc-500 mt-0.5">
              Starts an authoritative 120-second walk-up window at the SAC desk.
            </p>
          </div>
          <button
            onClick={onClose}
            disabled={isLoading}
            className="p-1 rounded-md text-zinc-400 hover:text-zinc-700 hover:bg-zinc-100 transition"
            aria-label="Close"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="mt-4 bg-zinc-50 rounded-lg border border-zinc-200 divide-y divide-zinc-200/70">
          {selectedItems.map(({ item, qty }) => (
            <div
              key={item.id}
              className="px-3.5 py-2.5 flex items-center justify-between text-xs"
            >
              <div>
                <span className="font-medium text-zinc-900">{item.name}</span>
                <span className="text-zinc-400 ml-1.5">({item.category})</span>
              </div>
              <span className="font-mono font-semibold tabular-nums text-zinc-800">
                ×{qty}
              </span>
            </div>
          ))}
          <div className="px-3.5 py-2 flex items-center justify-between text-xs bg-zinc-100/60">
            <span className="text-zinc-500">Total physical units</span>
            <strong className="font-mono tabular-nums text-zinc-900">{totalItems}</strong>
          </div>
        </div>

        <div className="mt-4 p-3 rounded-lg bg-amber-50 border border-amber-200 text-xs text-amber-900 leading-relaxed">
          Manual cancellation is disabled after submission. Exceeding 3 unfulfilled
          requests within 1 hour triggers a 5-hour checkout cooldown.
        </div>

        <div className="mt-5 flex items-center justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            disabled={isLoading}
            className="px-3.5 py-2 rounded-lg text-xs font-medium text-zinc-600 hover:bg-zinc-100 transition"
          >
            Back
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={isLoading}
            className="px-4 py-2 rounded-lg text-xs font-medium text-white bg-zinc-900 hover:bg-zinc-800 transition disabled:opacity-50"
          >
            {isLoading ? 'Submitting...' : 'Submit Counter Request'}
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
};
