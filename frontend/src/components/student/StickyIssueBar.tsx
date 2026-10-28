import React from 'react';
import type { SACItem } from '../../types/index';
import { ArrowRight, Trash2 } from 'lucide-react';

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
    <div className="fixed bottom-6 inset-x-0 z-40 flex justify-center px-4 pointer-events-none">
      <div className="pointer-events-auto bg-zinc-900/95 backdrop-blur-md text-white pl-4 pr-3 py-2.5 rounded-full shadow-2xl border border-zinc-800 flex items-center gap-3 animate-in slide-in-from-bottom-6 duration-200 hover:shadow-zinc-900/20 transition-all max-w-md w-full sm:w-auto">
        {/* Count badge */}
        <div className="flex items-center gap-2">
          <span className="w-6 h-6 rounded-full bg-blue-600 text-white font-mono font-bold text-xs flex items-center justify-center flex-shrink-0">
            {totalCount}
          </span>
          <span className="text-xs sm:text-sm font-semibold tracking-tight whitespace-nowrap">
            {totalCount} item{totalCount > 1 ? 's' : ''} selected
          </span>
        </div>

        <span className="text-zinc-600 hidden sm:inline">•</span>

        {/* Proceed Button */}
        <button
          onClick={onOpenConfirmModal}
          disabled={disabled}
          className="flex-1 sm:flex-none px-4 py-2 rounded-full text-xs sm:text-sm font-bold bg-white text-zinc-900 hover:bg-zinc-100 active:scale-95 transition flex items-center justify-center gap-1.5 shadow-sm disabled:opacity-50"
        >
          <span>Proceed to Issue</span>
          <ArrowRight className="w-3.5 h-3.5" />
        </button>

        {/* Clear selection icon */}
        <button
          onClick={onClear}
          className="p-1.5 text-zinc-400 hover:text-rose-400 hover:bg-zinc-800 rounded-full transition"
          title="Clear Selection"
          aria-label="Clear selection"
        >
          <Trash2 className="w-3.5 h-3.5" />
        </button>
      </div>
    </div>
  );
};
