import React from 'react';
import type { SACItem } from '../../types/index';
import { ArrowRight, X } from 'lucide-react';

interface SelectedItemInfo {
  item: SACItem;
  qty: number;
}

interface StickyIssueBarProps {
  selectedItems: SelectedItemInfo[];
  onOpenConfirmModal: () => void;
  onClear: () => void;
  disabled?: boolean;
}

export const StickyIssueBar: React.FC<StickyIssueBarProps> = ({
  selectedItems,
  onOpenConfirmModal,
  onClear,
  disabled = false
}) => {
  const totalCount = selectedItems.reduce((acc, curr) => acc + curr.qty, 0);

  if (totalCount === 0) return null;

  return (
    <div className="fixed bottom-5 inset-x-0 z-40 flex justify-center px-4 pointer-events-none">
      <div className="pointer-events-auto bg-zinc-900 text-white pl-3.5 pr-2.5 py-2 rounded-lg shadow-xl border border-zinc-800 flex items-center gap-3">
        <span className="text-xs font-medium tabular-nums">
          <strong className="font-mono">{totalCount}</strong> unit
          {totalCount > 1 ? 's' : ''} selected
        </span>

        <button
          onClick={onOpenConfirmModal}
          disabled={disabled}
          className="px-3 py-1.5 rounded-md text-xs font-semibold bg-white text-zinc-900 hover:bg-zinc-100 transition inline-flex items-center gap-1.5 disabled:opacity-50"
        >
          <span>Review checkout</span>
          <ArrowRight className="w-3.5 h-3.5" />
        </button>

        <button
          onClick={onClear}
          className="p-1 text-zinc-400 hover:text-white rounded transition"
          title="Clear selection"
          aria-label="Clear selection"
        >
          <X className="w-3.5 h-3.5" />
        </button>
      </div>
    </div>
  );
};
