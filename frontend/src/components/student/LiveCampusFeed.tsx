import React, { useState, useMemo } from 'react';
import type { SACItem } from '../../types/index';
import {
  Search,
  X,
  Plus,
  Minus,
  KeyRound,
  Dumbbell,
  Clock,
  Sparkles,
  DoorOpen
} from 'lucide-react';

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

  // Dynamic Categories derived directly from DB items
  const dynamicCategories = useMemo(() => {
    const categoriesSet = new Set(items.map((i) => i.category).filter(Boolean));
    return ['All', ...Array.from(categoriesSet)];
  }, [items]);

  // Real-time filtering by category and search query
  const filteredItems = useMemo(() => {
    return items.filter((item) => {
      const matchesCategory =
        activeCategory === 'All' || item.category === activeCategory;

      if (!matchesCategory) return false;

      if (!searchQuery.trim()) return true;

      const q = searchQuery.toLowerCase().trim();
      const matchName = item.name.toLowerCase().includes(q);
      const matchCat = item.category.toLowerCase().includes(q);
      const matchType = item.itemType.toLowerCase().includes(q);
      const matchLocation =
        item.itemType === 'ROOM_KEY'
          ? (item.name.includes('Dance') ? '1st floor' : 'ground floor').includes(q)
          : false;

      return matchName || matchCat || matchType || matchLocation;
    });
  }, [items, activeCategory, searchQuery]);

  // Separate Spaces vs. Gear visually
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
    return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: true });
  };

  return (
    <div className="space-y-6">
      {/* 1. Mobile-First Search Bar */}
      <div className="relative w-full">
        <Search className="w-4 h-4 text-zinc-400 absolute left-4 top-1/2 -translate-y-1/2 pointer-events-none" />
        <input
          type="text"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          placeholder="Search SAC equipment, rooms, or categories..."
          className="w-full h-12 bg-white border border-[#E4E4E7] rounded-2xl pl-11 pr-10 text-sm text-zinc-900 placeholder:text-zinc-400 focus:outline-none focus:ring-2 focus:ring-blue-600/20 focus:border-blue-600 shadow-xs transition"
        />
        {searchQuery && (
          <button
            onClick={() => setSearchQuery('')}
            className="absolute right-3.5 top-1/2 -translate-y-1/2 p-1 text-zinc-400 hover:text-zinc-700 rounded-full hover:bg-zinc-100 transition"
            aria-label="Clear search"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        )}
      </div>

      {/* 2. Dynamic Category Pills */}
      <div className="flex items-center gap-1.5 overflow-x-auto pb-1 scrollbar-none">
        {dynamicCategories.map((cat) => {
          const isActive = activeCategory === cat;
          return (
            <button
              key={cat}
              onClick={() => setActiveCategory(cat)}
              className={`px-3.5 py-1.5 rounded-full text-xs font-semibold whitespace-nowrap transition-all duration-150 ${
                isActive
                  ? 'bg-zinc-900 text-white shadow-xs'
                  : 'bg-white hover:bg-zinc-50 text-zinc-600 hover:text-zinc-900 border border-[#E4E4E7]'
              }`}
            >
              {cat}
            </button>
          );
        })}
      </div>

      {/* 3. Activity Rooms / Facility Spaces Section */}
      {roomItems.length > 0 && (
        <section className="space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="p-1.5 rounded-lg bg-indigo-50 text-indigo-600 border border-indigo-100">
                <KeyRound className="w-4 h-4" />
              </span>
              <h2 className="text-sm font-bold uppercase tracking-wider text-zinc-700">
                Activity Spaces & Keys ({roomItems.length})
              </h2>
            </div>
            <span className="text-[11px] text-zinc-400 font-medium">
              Privacy-Protected Live Status
            </span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
            {roomItems.map((room) => {
              const isAvailable = room.isAvailable && room.availableQty > 0;
              const selectedQty = selectedCounts[room.id] || 0;

              return (
                <div
                  key={room.id}
                  className="bg-white border border-[#E4E4E7] rounded-2xl p-4 sm:p-5 shadow-xs hover:shadow-md transition-all flex flex-col justify-between"
                >
                  <div>
                    {/* Header: Category & Live Status Pill */}
                    <div className="flex items-center justify-between gap-2 mb-3">
                      <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-zinc-700 bg-zinc-100 px-2.5 py-0.5 rounded-md border border-zinc-200">
                        <DoorOpen className="w-3.5 h-3.5 text-zinc-500" />
                        {room.category}
                      </span>

                      {isAvailable ? (
                        <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200">
                          <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                          Available Now
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-amber-50 text-amber-800 border border-amber-200">
                          <Clock className="w-3 h-3 text-amber-600" />
                          Occupied {formatOccupiedTime((room as any).occupied_since || room.occupiedSince) ? `since ${formatOccupiedTime((room as any).occupied_since || room.occupiedSince)}` : ''}
                        </span>
                      )}
                    </div>

                    <h3 className="font-bold text-base sm:text-lg text-zinc-900 tracking-tight">
                      {room.name}
                    </h3>

                    {/* Dynamic Key Info */}
                    <div className="flex items-center gap-2 mt-2">
                      <span className="inline-flex items-center gap-1 text-xs text-zinc-500 font-mono">
                        <KeyRound className="w-3.5 h-3.5 text-zinc-400" />
                        {isAvailable ? 'Physical Key in SAC Locker' : 'Key Issued & Handed Out'}
                      </span>
                    </div>

                    <p className="text-[11px] text-zinc-400 mt-2">
                      {isAvailable
                        ? 'Key ready in counter locker for instant checkout.'
                        : 'Currently in use by student group. Holder details protected by SAC policy.'}
                    </p>
                  </div>

                  {/* Action Bar */}
                  <div className="mt-4 pt-3 border-t border-zinc-100 flex items-center justify-between">
                    <span className="text-xs font-mono font-medium text-zinc-500">
                      {isAvailable ? '1 key available' : '0 keys available'}
                    </span>

                    <button
                      disabled={disabled || !isAvailable || selectedQty >= room.availableQty}
                      onClick={() => onIncrement(room)}
                      className={`px-4 py-2 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 active:scale-98 ${
                        selectedQty > 0
                          ? 'bg-blue-600 text-white shadow-xs'
                          : isAvailable && !disabled
                          ? 'bg-zinc-900 hover:bg-zinc-800 text-white shadow-xs'
                          : 'bg-zinc-100 text-zinc-400 cursor-not-allowed border border-zinc-200'
                      }`}
                    >
                      {selectedQty > 0 ? (
                        'Key in Bundle'
                      ) : isAvailable ? (
                        <>
                          <Plus className="w-3.5 h-3.5" /> Checkout Key
                        </>
                      ) : (
                        'Occupied'
                      )}
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </section>
      )}

      {/* 4. Sports Equipment & Gear Section */}
      {gearItems.length > 0 && (
        <section className="space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="p-1.5 rounded-lg bg-blue-50 text-blue-600 border border-blue-100">
                <Dumbbell className="w-4 h-4" />
              </span>
              <h2 className="text-sm font-bold uppercase tracking-wider text-zinc-700">
                Sports Gear & Equipment ({gearItems.length})
              </h2>
            </div>
            <span className="text-[11px] text-zinc-400 font-medium">
              Real-Time Stock Counters
            </span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3.5">
            {gearItems.map((item) => {
              const selectedQty = selectedCounts[item.id] || 0;
              const isAvailable = item.isAvailable && item.availableQty > 0;
              const availableLeft = item.availableQty - selectedQty;
              const stockPercent = item.totalQty > 0 ? (item.availableQty / item.totalQty) * 100 : 0;

              return (
                <div
                  key={item.id}
                  className="bg-white border border-[#E4E4E7] rounded-2xl p-4 shadow-xs hover:shadow-md transition-all flex flex-col justify-between"
                >
                  <div>
                    <div className="flex items-center justify-between gap-2 mb-2">
                      <span className="text-[11px] font-semibold text-zinc-500 px-2.5 py-0.5 rounded-full bg-zinc-100 border border-zinc-200">
                        {item.category}
                      </span>
                      <span
                        className={`font-mono text-xs font-bold ${
                          item.availableQty > 0 ? 'text-emerald-700' : 'text-rose-600'
                        }`}
                      >
                        {item.availableQty} / {item.totalQty} Available
                      </span>
                    </div>

                    <h3 className="font-bold text-base text-zinc-900 tracking-tight">
                      {item.name}
                    </h3>

                    {/* Minimalist Stock Meter */}
                    <div className="w-full bg-zinc-100 rounded-full h-1.5 overflow-hidden mt-3">
                      <div
                        className={`h-full rounded-full transition-all duration-300 ${
                          stockPercent > 50
                            ? 'bg-emerald-500'
                            : stockPercent > 20
                            ? 'bg-amber-500'
                            : 'bg-rose-500'
                        }`}
                        style={{ width: `${stockPercent}%` }}
                      />
                    </div>
                  </div>

                  {/* Minimalist Stepper (+ / - that only expands when qty > 0) */}
                  <div className="mt-4 pt-3 border-t border-zinc-100 flex items-center justify-between">
                    <span className="text-xs text-zinc-500">
                      {selectedQty > 0 ? (
                        <span className="text-blue-600 font-bold">
                          {selectedQty} unit{selectedQty > 1 ? 's' : ''} added
                        </span>
                      ) : (
                        'Quantity to issue'
                      )}
                    </span>

                    {selectedQty === 0 ? (
                      <button
                        type="button"
                        disabled={disabled || !isAvailable || availableLeft <= 0}
                        onClick={() => onIncrement(item)}
                        className="px-3.5 py-1.5 rounded-xl text-xs font-bold transition-all bg-zinc-100 hover:bg-zinc-200/80 text-zinc-800 disabled:opacity-40 disabled:cursor-not-allowed flex items-center gap-1 active:scale-95"
                      >
                        <Plus className="w-3.5 h-3.5" /> Add
                      </button>
                    ) : (
                      <div className="flex items-center gap-1 bg-blue-50/70 p-1 rounded-xl border border-blue-200/60 animate-in fade-in zoom-in-95 duration-150">
                        <button
                          type="button"
                          disabled={disabled}
                          onClick={() => onDecrement(item)}
                          className="w-7 h-7 rounded-lg bg-white hover:bg-blue-100 text-zinc-800 flex items-center justify-center transition shadow-xs active:scale-95 border border-blue-200/50"
                          aria-label={`Decrease ${item.name}`}
                        >
                          <Minus className="w-3 h-3" />
                        </button>

                        <span className="w-6 text-center font-mono font-bold text-xs text-blue-700">
                          {selectedQty}
                        </span>

                        <button
                          type="button"
                          disabled={disabled || availableLeft <= 0}
                          onClick={() => onIncrement(item)}
                          className="w-7 h-7 rounded-lg bg-blue-600 hover:bg-blue-500 text-white flex items-center justify-center transition shadow-xs active:scale-95 disabled:opacity-40"
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

      {/* Empty State */}
      {filteredItems.length === 0 && (
        <div className="text-center py-14 bg-white rounded-2xl border border-[#E4E4E7] shadow-xs">
          <Sparkles className="w-8 h-8 mx-auto mb-2 text-zinc-400" />
          <h4 className="text-sm font-bold text-zinc-800">No items match your search</h4>
          <p className="text-xs text-zinc-500 mt-1">
            Try adjusting your query or category filters.
          </p>
        </div>
      )}
    </div>
  );
};
