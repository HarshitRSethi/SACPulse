import React, { useState, useMemo } from 'react';
import type { SACItem } from '../../types/index';
import { Minus, Plus, Trash2, X } from 'lucide-react';

interface InventoryManagerTabProps {
  inventory: SACItem[];
  onAddNewItem: (payload: {
    name: string;
    category: string;
    itemType: 'EQUIPMENT' | 'ROOM_KEY';
    totalQty: number;
    availableQty: number;
  }) => Promise<void>;
  onAdjustStock: (item: SACItem, delta: number) => Promise<void>;
  onDeleteItem: (itemId: string) => Promise<void>;
}

const DEFAULT_CATEGORIES = [
  'Table Tennis',
  'Lawn Tennis',
  'Board Games',
  'Activity Rooms',
  'Badminton',
  'Squash',
  'Gym',
  'Music',
  'Cultural'
];

export const InventoryManagerTab: React.FC<InventoryManagerTabProps> = ({
  inventory,
  onAddNewItem,
  onAdjustStock,
  onDeleteItem
}) => {
  const [name, setName] = useState('');
  const [categoryMode, setCategoryMode] = useState<'existing' | 'custom'>('existing');
  const [selectedCategory, setSelectedCategory] = useState('Table Tennis');
  const [customCategory, setCustomCategory] = useState('');
  const [itemType, setItemType] = useState<'EQUIPMENT' | 'ROOM_KEY'>('EQUIPMENT');
  const [totalQty, setTotalQty] = useState(6);
  const [isAdding, setIsAdding] = useState(false);

  const [itemToDelete, setItemToDelete] = useState<SACItem | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  const existingCategories = useMemo(() => {
    const dynamic = inventory.map((i) => i.category).filter(Boolean);
    return Array.from(new Set([...DEFAULT_CATEGORIES, ...dynamic]));
  }, [inventory]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;
    const category =
      categoryMode === 'custom' ? customCategory.trim() : selectedCategory.trim();
    if (!category) return;

    const qty = itemType === 'ROOM_KEY' ? 1 : Math.max(1, totalQty);
    try {
      setIsAdding(true);
      await onAddNewItem({
        name: name.trim(),
        category,
        itemType,
        totalQty: qty,
        availableQty: qty
      });
      setName('');
      setCustomCategory('');
    } finally {
      setIsAdding(false);
    }
  };

  const handleConfirmDelete = async () => {
    if (!itemToDelete) return;
    try {
      setIsDeleting(true);
      await onDeleteItem(itemToDelete.id);
      setItemToDelete(null);
    } finally {
      setIsDeleting(false);
    }
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-start">
      {/* Add Catalog Item Form */}
      <form
        onSubmit={handleSubmit}
        className="lg:col-span-4 bg-white border border-zinc-200 rounded-lg p-4 space-y-3.5"
      >
        <div className="pb-2.5 border-b border-zinc-100">
          <h3 className="text-xs font-semibold text-zinc-900">Add Catalog Item</h3>
          <p className="text-[11px] text-zinc-500 mt-0.5">
            Register new multi-unit sports gear or singleton room keys.
          </p>
        </div>

        <div>
          <label className="block text-xs font-medium text-zinc-700 mb-1">
            Item Name
          </label>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g. Badminton Racket / Snooker Room Key"
            required
            className="w-full h-8 px-2.5 rounded-md border border-zinc-300 text-xs focus:outline-none focus:border-zinc-900"
          />
        </div>

        <div>
          <label className="block text-xs font-medium text-zinc-700 mb-1">
            Item Type
          </label>
          <div className="grid grid-cols-2 gap-1.5">
            <button
              type="button"
              onClick={() => setItemType('EQUIPMENT')}
              className={`py-1.5 px-2.5 rounded-md text-xs font-medium border transition ${
                itemType === 'EQUIPMENT'
                  ? 'bg-zinc-900 text-white border-zinc-900'
                  : 'bg-white text-zinc-700 border-zinc-200 hover:bg-zinc-50'
              }`}
            >
              Equipment
            </button>
            <button
              type="button"
              onClick={() => {
                setItemType('ROOM_KEY');
                setTotalQty(1);
              }}
              className={`py-1.5 px-2.5 rounded-md text-xs font-medium border transition ${
                itemType === 'ROOM_KEY'
                  ? 'bg-zinc-900 text-white border-zinc-900'
                  : 'bg-white text-zinc-700 border-zinc-200 hover:bg-zinc-50'
              }`}
            >
              Room Key
            </button>
          </div>
        </div>

        <div>
          <div className="flex items-center justify-between mb-1">
            <label className="text-xs font-medium text-zinc-700">Category</label>
            <button
              type="button"
              onClick={() =>
                setCategoryMode((m) => (m === 'existing' ? 'custom' : 'existing'))
              }
              className="text-[11px] text-zinc-500 hover:text-zinc-900 underline"
            >
              {categoryMode === 'existing' ? 'Custom category' : 'Choose existing'}
            </button>
          </div>

          {categoryMode === 'existing' ? (
            <select
              value={selectedCategory}
              onChange={(e) => setSelectedCategory(e.target.value)}
              className="w-full h-8 px-2.5 rounded-md border border-zinc-300 text-xs bg-white focus:outline-none focus:border-zinc-900"
            >
              {existingCategories.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          ) : (
            <input
              type="text"
              value={customCategory}
              onChange={(e) => setCustomCategory(e.target.value)}
              placeholder="e.g. Indoor Games"
              required
              className="w-full h-8 px-2.5 rounded-md border border-zinc-300 text-xs focus:outline-none focus:border-zinc-900"
            />
          )}
        </div>

        {itemType === 'EQUIPMENT' && (
          <div>
            <label className="block text-xs font-medium text-zinc-700 mb-1">
              Initial Total Quantity
            </label>
            <input
              type="number"
              min={1}
              max={500}
              value={totalQty}
              onChange={(e) => setTotalQty(Math.max(1, Number(e.target.value) || 1))}
              className="w-full h-8 px-2.5 rounded-md border border-zinc-300 text-xs font-mono tabular-nums focus:outline-none focus:border-zinc-900"
            />
          </div>
        )}

        <button
          type="submit"
          disabled={isAdding || !name.trim()}
          className="w-full py-2 px-3 rounded-md text-xs font-medium bg-zinc-900 hover:bg-zinc-800 text-white transition disabled:opacity-50"
        >
          {isAdding ? 'Adding...' : 'Add to Catalog'}
        </button>
      </form>

      {/* Catalog Table */}
      <div className="lg:col-span-8 bg-white border border-zinc-200 rounded-lg overflow-hidden">
        <div className="px-4 py-2.5 bg-zinc-50/80 border-b border-zinc-200 flex items-center justify-between">
          <h3 className="text-xs font-semibold text-zinc-800">
            SAC Catalog ({inventory.length})
          </h3>
          <span className="text-[11px] text-zinc-500">
            Active checkouts block item deletion
          </span>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-zinc-50/50 border-b border-zinc-200 text-[11px] font-semibold uppercase tracking-wider text-zinc-500">
                <th className="py-2.5 px-3.5">Item</th>
                <th className="py-2.5 px-3.5">Type</th>
                <th className="py-2.5 px-3.5">Stock</th>
                <th className="py-2.5 px-3.5 text-right">Controls</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-100 text-xs">
              {inventory.map((item) => {
                const isRoom = item.itemType === 'ROOM_KEY';
                return (
                  <tr key={item.id} className="hover:bg-zinc-50/60 transition">
                    <td className="py-2.5 px-3.5">
                      <div className="font-medium text-zinc-900">{item.name}</div>
                      <div className="text-[11px] text-zinc-500">{item.category}</div>
                    </td>
                    <td className="py-2.5 px-3.5">
                      <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-zinc-100 text-zinc-700 border border-zinc-200">
                        {isRoom ? 'ROOM_KEY' : 'EQUIPMENT'}
                      </span>
                    </td>
                    <td className="py-2.5 px-3.5 font-mono tabular-nums text-zinc-700">
                      <span>
                        {item.availableQty} / {item.totalQty}
                      </span>
                      {(item.damagedQty ?? 0) > 0 && (
                        <span className="ml-2 text-[10px] text-red-600">
                          ({item.damagedQty} damaged)
                        </span>
                      )}
                    </td>
                    <td className="py-2.5 px-3.5">
                      <div className="flex items-center justify-end gap-1.5">
                        {!isRoom && (
                          <div className="inline-flex items-center border border-zinc-200 rounded-md overflow-hidden bg-white">
                            <button
                              type="button"
                              disabled={item.availableQty <= 0}
                              onClick={() => onAdjustStock(item, -1)}
                              className="w-6 h-6 flex items-center justify-center hover:bg-zinc-100 text-zinc-700 disabled:opacity-35"
                              title="Decrease stock by 1"
                            >
                              <Minus className="w-3 h-3" />
                            </button>
                            <button
                              type="button"
                              onClick={() => onAdjustStock(item, 1)}
                              className="w-6 h-6 flex items-center justify-center hover:bg-zinc-100 text-zinc-700 border-l border-zinc-200"
                              title="Increase stock by 1"
                            >
                              <Plus className="w-3 h-3" />
                            </button>
                          </div>
                        )}

                        <button
                          type="button"
                          onClick={() => setItemToDelete(item)}
                          className="p-1.5 rounded-md border border-zinc-200 hover:border-red-200 hover:bg-red-50 text-zinc-500 hover:text-red-600 transition"
                          title={`Delete ${item.name}`}
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Delete Confirmation Modal */}
      {itemToDelete && (
        <div className="fixed inset-0 z-[100] bg-zinc-950/50 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="w-full max-w-sm bg-white border border-zinc-200 rounded-xl shadow-xl p-5">
            <div className="flex items-start justify-between">
              <h4 className="text-sm font-semibold text-zinc-900">
                Remove Catalog Item
              </h4>
              <button
                onClick={() => setItemToDelete(null)}
                className="text-zinc-400 hover:text-zinc-700"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <p className="text-xs text-zinc-600 mt-2 leading-relaxed">
              Delete <strong>{itemToDelete.name}</strong> from the live SAC catalog?
              Deletion is blocked automatically if any physical units are currently
              checked out.
            </p>
            <div className="mt-4 flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={() => setItemToDelete(null)}
                disabled={isDeleting}
                className="px-3 py-1.5 rounded-md text-xs font-medium text-zinc-600 hover:bg-zinc-100"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleConfirmDelete}
                disabled={isDeleting}
                className="px-3 py-1.5 rounded-md text-xs font-medium bg-red-600 hover:bg-red-700 text-white disabled:opacity-50"
              >
                {isDeleting ? 'Deleting...' : 'Delete Item'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

