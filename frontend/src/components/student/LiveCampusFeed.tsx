import React, { useState, useMemo } from 'react';
import type { SACItem } from '../../types/index';
import { Minus, Plus, Search, X } from 'lucide-react';

interface LiveCampusFeedProps {
  items: SACItem[];
  selectedCounts: Record<string, number>;
  onIncrement: (item: SACItem) => void;
  onDecrement: (item: SACItem) => void;
  disabled?: boolean;
}

export const LiveCampusFeed: React.FC<LiveCampusFeedProps> = ({
  items,
  selectedCounts,
  onIncrement,
  onDecrement,
  disabled = false
}) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [activeCategory, setActiveCategory] = useState('All');

  const categories = useMemo(() => {
    return ['All', ...new Set(items.map((i) => i.category).filter(Boolean))];
  }, [items]);

  const filteredItems = useMemo(() => {
    return items.filter((item) => {
      if (activeCategory !== 'All' && item.category !== activeCategory) {
        return false;
      }
      if (!searchQuery.trim()) return true;

      const q = searchQuery.toLowerCase().trim();
      return (
        item.name.toLowerCase().includes(q) ||
        (item.category || '').toLowerCase().includes(q) ||
        (item.itemType === 'ROOM_KEY' && 'room key space'.includes(q))
      );
    });
  }, [items, activeCategory, searchQuery]);

  const roomItems = useMemo(
    () => filteredItems.filter((i) => i.itemType === 'ROOM_KEY'),
    [filteredItems]
  );
  const gearItems = useMemo(
    () => filteredItems.filter((i) => i.itemType === 'EQUIPMENT'),
    [filteredItems]
  );

  const formatOccupiedTime = (isoString?: string | null) => {
    if (!isoString) return '';
    const date = new Date(isoString);
    if (isNaN(date.getTime())) return '';
    return date.toLocaleTimeString([], {
      hour: '2-digit',
      minute: '2-digit',
      hour12: true
    });
  };

  return (
    <div className="space-y-4">
      {/* Toolbar: Search + Category Filter */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5">
        <div className="relative w-full sm:max-w-xs">
          <Search className="w-3.5 h-3.5 text-zinc-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Filter equipment or rooms..."
            className="w-full h-9 bg-white border border-zinc-200 rounded-lg pl-8 pr-8 text-xs text-zinc-900 placeholder:text-zinc-400 focus:outline-none focus:border-zinc-900 transition"
          />
          {searchQuery && (
            <button
              onClick={() => setSearchQuery('')}
              className="absolute right-2.5 top-1/2 -translate-y-1/2 p-0.5 text-zinc-400 hover:text-zinc-700 rounded transition"
              aria-label="Clear search"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          )}
        </div>

        <div className="flex items-center gap-1 overflow-x-auto scrollbar-none">
          {categories.map((cat) => {
            const isActive = activeCategory === cat;
            return (
              <button
                key={cat}
                onClick={() => setActiveCategory(cat)}
                className={`px-2.5 py-1 rounded-md text-xs font-medium whitespace-nowrap transition ${
                  isActive
                    ? 'bg-zinc-900 text-white'
                    : 'bg-white hover:bg-zinc-50 text-zinc-600 border border-zinc-200'
                }`}
              >
                {cat}
              </button>
            );
          })}
        </div>
      </div>

      {/* Activity Rooms Table */}
      {roomItems.length > 0 && (
        <section className="bg-white border border-zinc-200 rounded-lg overflow-hidden">
          <div className="px-4 py-2.5 bg-zinc-50/70 border-b border-zinc-200 flex items-center justify-between">
            <h3 className="text-xs font-semibold text-zinc-800">
              Activity Spaces & Keys
            </h3>
            <span className="text-[11px] text-zinc-500">
              Holder identity redacted
            </span>
          </div>

          <div className="divide-y divide-zinc-100">
            {roomItems.map((room) => {
              const isAvailable = room.isAvailable && room.availableQty > 0;
              const selectedQty = selectedCounts[room.id] || 0;
              const occupiedSinceTime = (room as any).occupied_since || room.occupiedSince;
              const hasActiveStudentCheckout = room.hasActiveStudentCheckout ?? false;
              const isFacultySession = Boolean(
                room.isFacultySession ||
                  (occupiedSinceTime && !hasActiveStudentCheckout && !isAvailable)
              );
              const formattedSince = formatOccupiedTime(occupiedSinceTime);

              return (
                <div
                  key={room.id}
                  className="px-4 py-3 flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 hover:bg-zinc-50/60 transition"
                >
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-semibold text-zinc-900">
                        {room.name}
                      </span>
                      <span className="text-[11px] text-zinc-400">·</span>
                      <span className="text-xs text-zinc-500">{room.category}</span>
                    </div>
                  </div>

                  <div className="flex items-center justify-between sm:justify-end gap-4">
                    <div className="flex items-center gap-1.5 text-xs">
                      <span
                        className={`h-1.5 w-1.5 rounded-full shrink-0 ${
                          isAvailable ? 'bg-emerald-500' : 'bg-amber-500'
                        }`}
                      />
                      <span
                        className={
                          isAvailable ? 'text-zinc-700' : 'text-amber-800 tabular-nums'
                        }
                      >
                        {isAvailable
                          ? 'Available'
                          : isFacultySession
                            ? `Faculty session${formattedSince ? ` since ${formattedSince}` : ''}`
                            : `Occupied${formattedSince ? ` since ${formattedSince}` : ''}`}
                      </span>
                    </div>

                    {selectedQty > 0 ? (
                      <button
                        type="button"
                        disabled={disabled}
                        onClick={() => onDecrement(room)}
                        className="px-2.5 py-1 rounded-md text-xs font-medium bg-zinc-900 text-white hover:bg-zinc-800 transition"
                      >
                        Selected (Remove)
                      </button>
                    ) : (
                      <button
                        type="button"
                        disabled={disabled || !isAvailable}
                        onClick={() => onIncrement(room)}
                        className="px-2.5 py-1 rounded-md text-xs font-medium border border-zinc-200 bg-white hover:bg-zinc-50 text-zinc-800 disabled:opacity-40 disabled:cursor-not-allowed transition"
                      >
                        {isAvailable ? 'Request key' : 'Unavailable'}
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </section>
      )}

      {/* Sports Equipment Table */}
      {gearItems.length > 0 && (
        <section className="bg-white border border-zinc-200 rounded-lg overflow-hidden">
          <div className="px-4 py-2.5 bg-zinc-50/70 border-b border-zinc-200 flex items-center justify-between">
            <h3 className="text-xs font-semibold text-zinc-800">
              Sports Equipment
            </h3>
            <span className="text-[11px] text-zinc-500 tabular-nums">
              {gearItems.length} items
            </span>
          </div>

          <div className="divide-y divide-zinc-100">
            {gearItems.map((item) => {
              const selectedQty = selectedCounts[item.id] || 0;
              const isAvailable = item.isAvailable && item.availableQty > 0;
              const availableLeft = item.availableQty - selectedQty;
              const ratio =
                item.totalQty > 0 ? (item.availableQty / item.totalQty) * 100 : 0;

              return (
                <div
                  key={item.id}
                  className="px-4 py-3 flex items-center justify-between gap-3 hover:bg-zinc-50/60 transition"
                >
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-semibold text-zinc-900 truncate">
                        {item.name}
                      </span>
                      <span className="text-[11px] text-zinc-400 hidden sm:inline">·</span>
                      <span className="text-xs text-zinc-500 hidden sm:inline">
                        {item.category}
                      </span>
                    </div>
                    <span className="text-[11px] text-zinc-500 sm:hidden block">
                      {item.category}
                    </span>
                  </div>

                  {/* Stock indicator */}
                  <div className="flex items-center gap-3 shrink-0">
                    <div className="hidden md:block w-16 bg-zinc-100 rounded-full h-1 overflow-hidden">
                      <div
                        className={`h-full rounded-full transition-all ${
                          ratio > 40
                            ? 'bg-emerald-500'
                            : ratio > 0
                              ? 'bg-amber-500'
                              : 'bg-zinc-300'
                        }`}
                        style={{ width: `${ratio}%` }}
                      />
                    </div>
                    <span
                      className={`font-mono text-xs tabular-nums w-20 text-right ${
                        item.availableQty > 0 ? 'text-zinc-700' : 'text-zinc-400'
                      }`}
                    >
                      {item.availableQty} / {item.totalQty}
                    </span>
                  </div>

                  {/* Stepper */}
                  <div className="w-24 flex justify-end shrink-0">
                    {selectedQty === 0 ? (
                      <button
                        type="button"
                        disabled={disabled || !isAvailable || availableLeft <= 0}
                        onClick={() => onIncrement(item)}
                        className="px-2.5 py-1 rounded-md text-xs font-medium border border-zinc-200 bg-white hover:bg-zinc-50 text-zinc-800 disabled:opacity-40 disabled:cursor-not-allowed transition inline-flex items-center gap-1"
                      >
                        <Plus className="w-3 h-3" />
                        <span>Add</span>
                      </button>
                    ) : (
                      <div className="inline-flex items-center border border-zinc-300 rounded-md bg-white overflow-hidden">
                        <button
                          type="button"
                          disabled={disabled}
                          onClick={() => onDecrement(item)}
                          className="w-7 h-7 flex items-center justify-center hover:bg-zinc-100 text-zinc-700 transition"
                          aria-label={`Decrease ${item.name}`}
                        >
                          <Minus className="w-3 h-3" />
                        </button>
                        <span className="w-6 text-center font-mono text-xs font-semibold tabular-nums text-zinc-900">
                          {selectedQty}
                        </span>
                        <button
                          type="button"
                          disabled={disabled || availableLeft <= 0}
                          onClick={() => onIncrement(item)}
                          className="w-7 h-7 flex items-center justify-center hover:bg-zinc-100 text-zinc-700 disabled:opacity-35 transition"
                          aria-label={`Increase ${item.name}`}
                        >
                          <Plus className="w-3 h-3" />
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </section>
      )}

      {filteredItems.length === 0 && (
        <div className="text-center py-10 bg-white rounded-lg border border-zinc-200">
          <p className="text-xs font-medium text-zinc-700">No matching SAC items</p>
          <p className="text-[11px] text-zinc-500 mt-0.5">
            Clear your search filter or choose another category.
          </p>
        </div>
      )}
    </div>
  );
};
