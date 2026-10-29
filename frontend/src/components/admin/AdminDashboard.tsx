import React, { useState, useEffect, useMemo } from 'react';
import type { User, SACItem } from '../../types/index';
import { api } from '../../services/api';
import { socketService } from '../../services/socket';
import {
  Award,
  Search,
  Download,
  ShieldCheck,
  ShieldAlert,
  Timer,
  Boxes,
  Plus,
  Minus,
  RefreshCw,
  Filter,
  CheckCircle2,
  Check,
  Tag,
  ChevronLeft,
  ChevronRight
} from 'lucide-react';

interface AdminDashboardProps {
  currentUser: User;
}

export const AdminDashboard: React.FC<AdminDashboardProps> = ({ currentUser }) => {
  const [activeTab, setActiveTab] = useState<'register' | 'defaulters' | 'inventory'>('register');
  const [registerLogs, setRegisterLogs] = useState<any[]>([]);
  const [statusFilter, setStatusFilter] = useState<string>('ALL');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [currentPage, setCurrentPage] = useState<number>(1);
  const [totalPages, setTotalPages] = useState<number>(1);
  const [totalCount, setTotalCount] = useState<number>(0);
  const pageSize = 25;
  const [users, setUsers] = useState<User[]>([]);
  const [inventory, setInventory] = useState<SACItem[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [isRefreshingTable, setIsRefreshingTable] = useState<boolean>(false);
  const [showRefreshedTableCheck, setShowRefreshedTableCheck] = useState<boolean>(false);
  const [actionMessage, setActionMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  // New Item form state with dynamic and custom category creation
  const [newItemName, setNewItemName] = useState('');
  const [categoryMode, setCategoryMode] = useState<'existing' | 'custom'>('existing');
  const [selectedCategory, setSelectedCategory] = useState('Table Tennis');
  const [customCategory, setCustomCategory] = useState('');
  const [newItemType, setNewItemType] = useState<'EQUIPMENT' | 'ROOM_KEY'>('EQUIPMENT');
  const [newItemTotalQty, setNewItemTotalQty] = useState(10);
  const [isAddingItem, setIsAddingItem] = useState(false);

  // Derive existing categories from live inventory
  const existingCategories = useMemo(() => {
    const defaultCats = ['Table Tennis', 'Lawn Tennis', 'Board Games', 'Activity Rooms', 'Badminton', 'Squash', 'Gym', 'Music', 'Cultural'];
    const catsFromInv = inventory.map((i) => i.category).filter(Boolean);
    return Array.from(new Set([...defaultCats, ...catsFromInv]));
  }, [inventory]);

  const loadData = async (targetPage = currentPage) => {
    try {
      setIsLoading(true);
      const [logsRes, usersData, invData] = await Promise.all([
        api.getAdminLogs({ status: statusFilter, page: targetPage, limit: pageSize }),
        api.getAllUsers(),
        api.getInventory()
      ]);
      setRegisterLogs(logsRes.logs);
      setTotalCount(logsRes.totalCount);
      setTotalPages(logsRes.totalPages);
      setCurrentPage(logsRes.currentPage);
      setUsers(usersData);
      setInventory(invData);
    } catch (err: any) {
      console.error('Failed to load admin console data:', err);
      setActionMessage({ type: 'error', text: err.message || 'Failed to fetch logs' });
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    setCurrentPage(1);
    loadData(1);

    const socket = socketService.socket;
    if (socket) {
      const handleSync = () => {
        loadData();
      };
      socket.on('guard:register_swapped', handleSync);
      socket.on('guard:queue_updated', handleSync);
      socket.on('inventory:updated', handleSync);

      return () => {
        socket.off('guard:register_swapped', handleSync);
        socket.off('guard:queue_updated', handleSync);
        socket.off('inventory:updated', handleSync);
      };
    }
  }, [statusFilter]);

  const handlePageChange = (newPage: number) => {
    if (newPage < 1 || newPage > totalPages || newPage === currentPage) return;
    setCurrentPage(newPage);
    loadData(newPage);
  };

  // Clear Defaulter Flag
  const handleClearDefaulter = async (userId: string) => {
    try {
      setIsLoading(true);
      setActionMessage(null);
      await api.clearDefaulter(userId);
      setActionMessage({ type: 'success', text: 'Defaulter status cleared successfully.' });
      await loadData();
    } catch (err: any) {
      setActionMessage({ type: 'error', text: err.message || 'Failed to clear defaulter' });
    } finally {
      setIsLoading(false);
    }
  };

  // Reset 5-hour Cooldown
  const handleResetCooldown = async (userId: string) => {
    try {
      setIsLoading(true);
      setActionMessage(null);
      await api.resetCooldown(userId);
      setActionMessage({ type: 'success', text: 'Slot hoarding cooldown reset successfully.' });
      await loadData();
    } catch (err: any) {
      setActionMessage({ type: 'error', text: err.message || 'Failed to reset cooldown' });
    } finally {
      setIsLoading(false);
    }
  };

  // Adjust Inventory Stock
  const handleUpdateStock = async (item: SACItem, delta: number) => {
    try {
      const newTotal = Math.max(0, item.totalQty + delta);
      await api.upsertInventory({
        id: item.id,
        name: item.name,
        category: item.category,
        itemType: item.itemType,
        totalQty: newTotal
      });
      await loadData();
    } catch (err: any) {
      setActionMessage({ type: 'error', text: err.message || 'Failed to update stock' });
    }
  };

  // Add New Item with Dynamic or Custom Category
  const handleAddNewItem = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newItemName.trim()) return;

    const finalCategory =
      categoryMode === 'custom'
        ? customCategory.trim()
        : selectedCategory.trim();

    if (!finalCategory) {
      setActionMessage({ type: 'error', text: 'Please enter or select a category.' });
      return;
    }

    try {
      setIsLoading(true);
      await api.upsertInventory({
        name: newItemName.trim(),
        category: finalCategory,
        itemType: newItemType,
        totalQty: Number(newItemTotalQty)
      });
      setNewItemName('');
      setCustomCategory('');
      setCategoryMode('existing');
      setIsAddingItem(false);
      setActionMessage({
        type: 'success',
        text: `Item added successfully under category "${finalCategory}".`
      });
      await loadData();
    } catch (err: any) {
      setActionMessage({ type: 'error', text: err.message || 'Failed to add item' });
    } finally {
      setIsLoading(false);
    }
  };

  // Full Date & Time Display Formatter
  const formatDateTime = (val: any) => {
    if (!val) return { date: '—', time: '' };
    const d = new Date(val);
    if (isNaN(d.getTime())) return { date: '—', time: '' };
    const date = d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
    const time = d.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: true });
    return { date, time };
  };

  const formatTimestamp = (val: any) => {
    const { date, time } = formatDateTime(val);
    return date === '—' ? '—' : `${date}, ${time}`;
  };

  // Tactile refresh handler for table
  const handleRefreshTable = async () => {
    try {
      setIsRefreshingTable(true);
      await loadData(currentPage);
      setShowRefreshedTableCheck(true);
      setTimeout(() => setShowRefreshedTableCheck(false), 1500);
    } finally {
      setIsRefreshingTable(false);
    }
  };

  // Export Filtered Table to CSV (downloads full historical dataset)
  const handleExportCSV = async () => {
    try {
      const url = statusFilter && statusFilter !== 'ALL'
        ? `/api/admin/register-logs?format=csv&status=${statusFilter}`
        : `/api/admin/register-logs?format=csv`;
      const res = await fetch(url);
      if (!res.ok) throw new Error('Failed to generate CSV export');
      const blob = await res.blob();
      const downloadUrl = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = downloadUrl;
      link.setAttribute('download', `SACPulse_Register_Logs_${new Date().toISOString().slice(0, 10)}.csv`);
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    } catch (err: any) {
      console.error('Failed to export CSV:', err);
      alert('Failed to download full historical CSV export.');
    }
  };

  // Filtered Register Logs (supports both snake_case and camelCase)
  const filteredLogs = registerLogs.filter((log) => {
    const q = searchQuery.toLowerCase().trim();
    if (!q) return true;
    const studentName = (log.student_name || log.studentName || '').toLowerCase();
    const rollNo = (log.roll_no || log.rollNo || '').toLowerCase();
    const itemName = (log.item_name || log.itemName || '').toLowerCase();
    const batchId = (log.batch_id || log.batchId || '').toLowerCase();
    return (
      studentName.includes(q) ||
      rollNo.includes(q) ||
      itemName.includes(q) ||
      batchId.includes(q)
    );
  });

  // Students on Defaulters or Cooldown
  const studentUsers = users.filter((u) => u.role === 'STUDENT');
  const defaulterStudents = studentUsers.filter((u) => u.isDefaulter);
  const cooldownStudents = studentUsers.filter(
    (u) => u.penaltyUntil && new Date(u.penaltyUntil) > new Date()
  );

  return (
    <div className="max-w-7xl mx-auto px-4 py-6 space-y-6 pb-20">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <span className="p-2 rounded-xl bg-purple-50 text-purple-700 border border-purple-200">
              <Award className="w-5 h-5" />
            </span>
            <h1 className="text-2xl sm:text-3xl font-extrabold text-zinc-900 tracking-tight">
              SAC Governance Console
            </h1>
          </div>
          <p className="text-xs sm:text-sm text-zinc-500 mt-1">
            Logged in administrator: <strong className="text-zinc-800">{currentUser.name}</strong>
          </p>
        </div>

        {/* Tab Switcher */}
        <div className="flex items-center gap-1.5 p-1 rounded-2xl bg-zinc-100 border border-[#E4E4E7]">
          <button
            onClick={() => setActiveTab('register')}
            className={`px-3.5 py-1.5 rounded-xl text-xs font-semibold transition ${
              activeTab === 'register'
                ? 'bg-white text-zinc-900 shadow-xs'
                : 'text-zinc-600 hover:text-zinc-900'
            }`}
          >
            Digital Register
          </button>
          <button
            onClick={() => setActiveTab('defaulters')}
            className={`px-3.5 py-1.5 rounded-xl text-xs font-semibold transition flex items-center gap-1.5 ${
              activeTab === 'defaulters'
                ? 'bg-white text-zinc-900 shadow-xs'
                : 'text-zinc-600 hover:text-zinc-900'
            }`}
          >
            <span>Defaulters & Cooldowns</span>
            {defaulterStudents.length > 0 ? (
              <span className="px-1.5 py-0.2 rounded-full bg-rose-600 text-white text-[10px] font-bold">
                {defaulterStudents.length}
              </span>
            ) : cooldownStudents.length > 0 ? (
              <span className="w-2 h-2 rounded-full bg-amber-500 animate-pulse" />
            ) : null}
          </button>
          <button
            onClick={() => setActiveTab('inventory')}
            className={`px-3.5 py-1.5 rounded-xl text-xs font-semibold transition ${
              activeTab === 'inventory'
                ? 'bg-white text-zinc-900 shadow-xs'
                : 'text-zinc-600 hover:text-zinc-900'
            }`}
          >
            Inventory Manager
          </button>
        </div>
      </div>

      {/* Top Stat Cards Bar */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <button
          onClick={() => setActiveTab('register')}
          className={`p-4 rounded-2xl border text-left transition-all ${
            activeTab === 'register'
              ? 'bg-white border-purple-500 shadow-xs ring-1 ring-purple-400/40'
              : 'bg-white border-[#E4E4E7] hover:border-zinc-300 shadow-xs'
          }`}
        >
          <span className="text-[10px] font-bold uppercase tracking-wider text-zinc-400 block">
            Digital Register
          </span>
          <span className="font-mono text-xl font-extrabold text-zinc-900 mt-0.5 block">
            {registerLogs.length} Entries
          </span>
        </button>

        <button
          onClick={() => setActiveTab('defaulters')}
          className={`p-4 rounded-2xl border text-left transition-all ${
            activeTab === 'defaulters'
              ? 'bg-white border-rose-500 shadow-xs ring-1 ring-rose-400/40'
              : 'bg-white border-[#E4E4E7] hover:border-zinc-300 shadow-xs'
          }`}
        >
          <span className="text-[10px] font-bold uppercase tracking-wider text-rose-600 block flex items-center justify-between">
            <span>SAC Defaulters</span>
            {defaulterStudents.length > 0 && (
              <span className="w-2 h-2 rounded-full bg-rose-500 animate-pulse" />
            )}
          </span>
          <span className={`font-mono text-xl font-extrabold mt-0.5 block ${
            defaulterStudents.length > 0 ? 'text-rose-600' : 'text-zinc-800'
          }`}>
            {defaulterStudents.length} Flagged
          </span>
        </button>

        <button
          onClick={() => setActiveTab('defaulters')}
          className={`p-4 rounded-2xl border text-left transition-all ${
            activeTab === 'defaulters'
              ? 'bg-white border-amber-500 shadow-xs ring-1 ring-amber-400/40'
              : 'bg-white border-[#E4E4E7] hover:border-zinc-300 shadow-xs'
          }`}
        >
          <span className="text-[10px] font-bold uppercase tracking-wider text-amber-700 block">
            Slot Cooldowns
          </span>
          <span className="font-mono text-xl font-extrabold text-amber-800 mt-0.5 block">
            {cooldownStudents.length} Active
          </span>
        </button>

        <button
          onClick={() => setActiveTab('inventory')}
          className={`p-4 rounded-2xl border text-left transition-all ${
            activeTab === 'inventory'
              ? 'bg-white border-purple-500 shadow-xs ring-1 ring-purple-400/40'
              : 'bg-white border-[#E4E4E7] hover:border-zinc-300 shadow-xs'
          }`}
        >
          <span className="text-[10px] font-bold uppercase tracking-wider text-zinc-400 block">
            Inventory Units
          </span>
          <span className="font-mono text-xl font-extrabold text-zinc-900 mt-0.5 block">
            {inventory.reduce((acc, item) => acc + item.totalQty, 0)} Units
          </span>
        </button>
      </div>

      {/* Prominent Defaulter Notice if Any Exist */}
      {defaulterStudents.length > 0 && activeTab !== 'defaulters' && (
        <div className="rounded-2xl p-4 bg-rose-50 border border-rose-200 text-rose-900 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs shadow-xs">
          <div className="flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-rose-600 animate-pulse flex-shrink-0" />
            <span>
              <strong>{defaulterStudents.length} student account(s)</strong> flagged as SAC Defaulter (e.g.{' '}
              {defaulterStudents.map((s) => `${s.name} - ${s.rollNo}`).join(', ')}).
            </span>
          </div>
          <button
            onClick={() => setActiveTab('defaulters')}
            className="px-3 py-1.5 rounded-xl text-xs font-bold bg-rose-600 hover:bg-rose-500 text-white transition flex-shrink-0 self-start sm:self-auto shadow-xs"
          >
            Review Defaulters →
          </button>
        </div>
      )}

      {/* Action Notification */}
      {actionMessage && (
        <div
          className={`p-3.5 rounded-2xl text-xs font-semibold border flex items-center justify-between shadow-xs ${
            actionMessage.type === 'success'
              ? 'bg-emerald-50 border-emerald-200 text-emerald-800'
              : 'bg-rose-50 border border-rose-200 text-rose-800'
          }`}
        >
          <span>{actionMessage.text}</span>
          <button
            onClick={() => setActionMessage(null)}
            className="text-zinc-400 hover:text-zinc-700 underline text-xs"
          >
            Dismiss
          </button>
        </div>
      )}

      {/* TAB 1: MASTER DIGITAL REGISTER */}
      {activeTab === 'register' && (
        <div className="space-y-4">
          {/* Controls: Search, Filter, Export */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-white p-3.5 rounded-2xl border border-[#E4E4E7] shadow-xs">
            <div className="flex flex-wrap items-center gap-3">
              <div className="relative w-full sm:w-64">
                <Search className="w-4 h-4 text-zinc-400 absolute left-3 top-2.5" />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Filter student, roll no, item..."
                  className="w-full bg-zinc-50 border border-zinc-200 rounded-xl pl-9 pr-3 py-1.5 text-xs text-zinc-900 placeholder:text-zinc-400 focus:outline-none focus:ring-2 focus:ring-purple-500/20 focus:border-purple-500"
                />
              </div>

              {/* Status Filter Dropdown */}
              <div className="flex items-center gap-1.5 text-xs text-zinc-500">
                <Filter className="w-3.5 h-3.5" />
                <select
                  value={statusFilter}
                  onChange={(e) => setStatusFilter(e.target.value)}
                  className="bg-zinc-50 border border-zinc-200 rounded-xl px-2.5 py-1.5 text-xs text-zinc-800 focus:outline-none focus:border-purple-500 font-medium"
                >
                  <option value="ALL">All Statuses</option>
                  <option value="ISSUED">ISSUED</option>
                  <option value="ISSUED_TRANSFER_PENDING">TRANSFER PENDING</option>
                  <option value="RETURNED">RETURNED</option>
                  <option value="RETURNED_VIA_TRANSFER">RETURNED VIA TRANSFER</option>
                  <option value="DAMAGED">DAMAGED</option>
                </select>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <button
                onClick={handleRefreshTable}
                disabled={isRefreshingTable}
                className={`p-2 rounded-xl border transition flex items-center gap-1.5 text-xs font-semibold ${
                  showRefreshedTableCheck
                    ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                    : 'bg-zinc-100 hover:bg-zinc-200/80 text-zinc-700 border-zinc-200'
                }`}
                title="Refresh Table"
              >
                {showRefreshedTableCheck ? (
                  <>
                    <Check className="w-3.5 h-3.5 text-emerald-600" />
                    <span>Refreshed ✓</span>
                  </>
                ) : (
                  <RefreshCw className={`w-4 h-4 ${isRefreshingTable ? 'animate-spin text-blue-600' : ''}`} />
                )}
              </button>

              <button
                onClick={handleExportCSV}
                className="px-4 py-2 rounded-xl text-xs font-bold text-white bg-zinc-900 hover:bg-zinc-800 transition shadow-xs flex items-center gap-1.5"
              >
                <Download className="w-3.5 h-3.5" /> Export to CSV
              </button>
            </div>
          </div>

          {/* Table */}
          <div className="rounded-2xl border border-[#E4E4E7] bg-white overflow-hidden shadow-xs">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs text-zinc-700">
                <thead className="bg-zinc-50 text-zinc-500 uppercase tracking-wider text-[10px] font-bold border-b border-[#E4E4E7]">
                  <tr>
                    <th className="px-4 py-3">Entry ID</th>
                    <th className="px-4 py-3">Item & Category</th>
                    <th className="px-4 py-3">Holder Student</th>
                    <th className="px-4 py-3">Arrival Time</th>
                    <th className="px-4 py-3">Return Time</th>
                    <th className="px-4 py-3">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-100">
                  {filteredLogs.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="px-4 py-8 text-center text-zinc-400">
                        No register logs matching your criteria.
                      </td>
                    </tr>
                  ) : (
                    filteredLogs.map((log) => {
                      let badgeStyle = 'bg-zinc-100 text-zinc-600 border-zinc-200';
                      if (log.status === 'ISSUED') {
                        badgeStyle = 'bg-blue-50 text-blue-700 border-blue-200';
                      } else if (log.status === 'RETURNED' || log.status === 'RETURNED_VIA_TRANSFER') {
                        badgeStyle = 'bg-emerald-50 text-emerald-700 border-emerald-200';
                      } else if (log.status === 'DAMAGED') {
                        badgeStyle = 'bg-rose-50 text-rose-700 border-rose-200 font-bold';
                      } else if (log.status === 'ISSUED_TRANSFER_PENDING') {
                        badgeStyle = 'bg-amber-50 text-amber-800 border-amber-200';
                      }

                      const arrivalVal = log.arrival_time || log.arrivalTime;
                      const departureVal = log.departure_time || log.departureTime || log.returnTime || log.return_time;
                      const itemName = (log.item_name || log.itemName || 'Item');
                      const studentName = (log.student_name || log.studentName || 'Student');
                      const rollNo = (log.roll_no || log.rollNo || '—');
                      const category = log.category || '';

                      const arrivalFormatted = formatDateTime(arrivalVal);
                      const departureFormatted = formatDateTime(departureVal);

                      return (
                        <tr key={log.id} className="hover:bg-zinc-50/70 transition">
                          <td className="px-4 py-3 font-mono text-zinc-400 text-[11px]">
                            {log.id.slice(0, 8)}...
                          </td>
                          <td className="px-4 py-3">
                            <span className="font-bold text-zinc-900 block">{itemName}</span>
                            <span className="text-[10px] text-zinc-500">{category}</span>
                          </td>
                          <td className="px-4 py-3">
                            <span className="font-semibold text-zinc-900 block">{studentName}</span>
                            <span className="font-mono text-[11px] text-blue-600">{rollNo}</span>
                          </td>
                          <td className="px-4 py-3">
                            <span className="font-medium text-zinc-900 block">{arrivalFormatted.date}</span>
                            {arrivalFormatted.time && (
                              <span className="text-[11px] text-zinc-400 font-mono block">{arrivalFormatted.time}</span>
                            )}
                          </td>
                          <td className="px-4 py-3">
                            <span className="font-medium text-zinc-900 block">{departureFormatted.date}</span>
                            {departureFormatted.time && (
                              <span className="text-[11px] text-zinc-400 font-mono block">{departureFormatted.time}</span>
                            )}
                          </td>
                          <td className="px-4 py-3">
                            <span
                              className={`inline-block px-2.5 py-0.5 rounded-full text-[10px] font-bold border ${badgeStyle}`}
                            >
                              {log.status}
                            </span>
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>

            {/* Pagination Footer */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 px-4 py-3 bg-zinc-50 border-t border-[#E4E4E7] text-xs text-zinc-600">
              <span className="font-medium text-zinc-500">
                Showing <span className="font-semibold text-zinc-900 font-mono">{totalCount === 0 ? 0 : (currentPage - 1) * pageSize + 1}</span>–
                <span className="font-semibold text-zinc-900 font-mono">{Math.min(totalCount, (currentPage - 1) * pageSize + registerLogs.length)}</span> of{' '}
                <span className="font-semibold text-zinc-900 font-mono">{totalCount}</span> entries
              </span>
              <div className="flex items-center gap-2 self-end sm:self-auto">
                <button
                  onClick={() => handlePageChange(currentPage - 1)}
                  disabled={currentPage <= 1 || isLoading}
                  className="px-3 py-1.5 rounded-xl border border-zinc-200 bg-white hover:bg-zinc-50 text-zinc-700 font-semibold disabled:opacity-40 disabled:cursor-not-allowed transition shadow-xs flex items-center gap-1 active:scale-95"
                >
                  <ChevronLeft className="w-3.5 h-3.5" />
                  Previous
                </button>
                <span className="px-2 text-zinc-500 font-mono font-medium text-xs">
                  Page {currentPage} of {totalPages}
                </span>
                <button
                  onClick={() => handlePageChange(currentPage + 1)}
                  disabled={currentPage >= totalPages || isLoading}
                  className="px-3 py-1.5 rounded-xl border border-zinc-200 bg-white hover:bg-zinc-50 text-zinc-700 font-semibold disabled:opacity-40 disabled:cursor-not-allowed transition shadow-xs flex items-center gap-1 active:scale-95"
                >
                  Next
                  <ChevronRight className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* TAB 2: DEFAULTERS & COOLDOWNS */}
      {activeTab === 'defaulters' && (
        <div className="space-y-6">
          {/* Defaulters Section */}
          <section className="space-y-3">
            <div className="flex items-center gap-2">
              <ShieldAlert className="w-5 h-5 text-rose-600" />
              <h2 className="text-base font-bold text-zinc-900 tracking-tight">
                Official SAC Defaulters ({defaulterStudents.length})
              </h2>
            </div>
            <p className="text-xs text-zinc-500">
              Students who damaged equipment or failed to account for issued units. Their account cannot checkout items until cleared by an administrator.
            </p>

            {defaulterStudents.length === 0 ? (
              <div className="rounded-2xl p-8 bg-white border border-[#E4E4E7] text-center shadow-xs">
                <ShieldCheck className="w-8 h-8 text-emerald-500 mx-auto mb-2" />
                <h3 className="text-sm font-bold text-zinc-800">Clean Sheet</h3>
                <p className="text-xs text-zinc-500 mt-1">
                  No students are currently flagged as SAC Defaulters.
                </p>
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3.5">
                {defaulterStudents.map((s) => (
                  <div
                    key={s.id}
                    className="rounded-2xl p-5 bg-white border border-rose-200 shadow-xs flex flex-col justify-between"
                  >
                    <div>
                      <div className="flex items-center justify-between gap-2 mb-2">
                        <span className="font-mono text-xs font-bold px-2.5 py-0.5 rounded-md bg-rose-50 text-rose-700 border border-rose-200">
                          {s.rollNo}
                        </span>
                        <span className="text-[10px] uppercase font-bold text-rose-700 px-2 py-0.5 rounded-full bg-rose-100">
                          Defaulter
                        </span>
                      </div>
                      <h4 className="font-bold text-base text-zinc-900">{s.name}</h4>
                      <p className="text-xs text-zinc-500 mt-0.5">{s.email}</p>
                      {s.mobileNo && (
                        <p className="text-xs text-zinc-500 font-mono mt-0.5">Mobile: {s.mobileNo}</p>
                      )}
                    </div>

                    <div className="mt-4 pt-3 border-t border-zinc-100 flex items-center justify-end">
                      <button
                        onClick={() => handleClearDefaulter(s.id)}
                        disabled={isLoading}
                        className="px-4 py-2 rounded-xl text-xs font-bold text-white bg-emerald-600 hover:bg-emerald-500 transition shadow-xs flex items-center gap-1.5"
                      >
                        <CheckCircle2 className="w-3.5 h-3.5" /> Clear Defaulter
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </section>

          {/* Cooldowns Section */}
          <section className="space-y-3 pt-4 border-t border-zinc-200">
            <div className="flex items-center gap-2">
              <Timer className="w-5 h-5 text-amber-600" />
              <h2 className="text-base font-bold text-zinc-900 tracking-tight">
                Active Slot-Hoarding Cooldowns ({cooldownStudents.length})
              </h2>
            </div>
            <p className="text-xs text-zinc-500">
              Students automatically penalized with a 5-hour cooldown due to letting 3 consecutive requests time out within 1 hour.
            </p>

            {cooldownStudents.length === 0 ? (
              <div className="rounded-2xl p-8 bg-white border border-[#E4E4E7] text-center shadow-xs">
                <Timer className="w-8 h-8 text-zinc-400 mx-auto mb-2" />
                <h3 className="text-sm font-bold text-zinc-800">No Active Penalties</h3>
                <p className="text-xs text-zinc-500 mt-1">
                  No students currently have slot hoarding cooldowns.
                </p>
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3.5">
                {cooldownStudents.map((s) => (
                  <div
                    key={s.id}
                    className="rounded-2xl p-5 bg-white border border-amber-200 shadow-xs flex flex-col justify-between"
                  >
                    <div>
                      <div className="flex items-center justify-between gap-2 mb-2">
                        <span className="font-mono text-xs font-bold px-2.5 py-0.5 rounded-md bg-amber-50 text-amber-800 border border-amber-200">
                          {s.rollNo}
                        </span>
                        <span className="text-[10px] uppercase font-bold text-amber-800 px-2 py-0.5 rounded-full bg-amber-100">
                          5-Hour Cooldown
                        </span>
                      </div>
                      <h4 className="font-bold text-base text-zinc-900">{s.name}</h4>
                      <p className="text-xs text-zinc-500 mt-0.5">
                        Active Until:{' '}
                        <span className="font-mono font-semibold text-amber-900">
                          {formatTimestamp(s.penaltyUntil)}
                        </span>
                      </p>
                    </div>

                    <div className="mt-4 pt-3 border-t border-zinc-100 flex items-center justify-end">
                      <button
                        onClick={() => handleResetCooldown(s.id)}
                        disabled={isLoading}
                        className="px-4 py-2 rounded-xl text-xs font-bold text-white bg-amber-600 hover:bg-amber-500 transition shadow-xs flex items-center gap-1.5"
                      >
                        <Timer className="w-3.5 h-3.5" /> Reset Cooldown
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </section>
        </div>
      )}

      {/* TAB 3: INVENTORY MANAGER */}
      {activeTab === 'inventory' && (
        <div className="space-y-6">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div>
              <h2 className="text-base font-bold text-zinc-900 tracking-tight flex items-center gap-2">
                <Boxes className="w-4 h-4 text-purple-600" />
                SAC Equipment & Room Inventory
              </h2>
              <p className="text-xs text-zinc-500">
                Adjust stock levels or add new equipment items and custom categories to the live campus register.
              </p>
            </div>

            <button
              onClick={() => setIsAddingItem(!isAddingItem)}
              className="px-4 py-2 rounded-xl text-xs font-bold text-white bg-zinc-900 hover:bg-zinc-800 transition shadow-xs flex items-center gap-1.5 self-start sm:self-auto"
            >
              <Plus className="w-3.5 h-3.5" /> {isAddingItem ? 'Cancel' : 'Add New Item'}
            </button>
          </div>

          {/* Add Item Form with Custom Category Support */}
          {isAddingItem && (
            <form
              onSubmit={handleAddNewItem}
              className="p-5 rounded-3xl bg-white border border-[#E4E4E7] shadow-lg space-y-4 animate-in fade-in duration-200"
            >
              <div className="flex items-center justify-between pb-3 border-b border-zinc-100">
                <h3 className="text-sm font-bold text-zinc-900 flex items-center gap-2">
                  <Plus className="w-4 h-4 text-purple-600" /> Create New SAC Inventory Item
                </h3>
                <span className="text-[11px] text-zinc-400 font-medium">
                  Supports new custom categories
                </span>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3.5">
                <div>
                  <label className="text-[11px] font-bold text-zinc-700 block mb-1">
                    Item Name
                  </label>
                  <input
                    type="text"
                    required
                    value={newItemName}
                    onChange={(e) => setNewItemName(e.target.value)}
                    placeholder="e.g. Squash Racket"
                    className="w-full bg-zinc-50 border border-zinc-200 rounded-xl px-3 py-2 text-xs text-zinc-900 focus:outline-none focus:ring-2 focus:ring-purple-500/20 focus:border-purple-500 shadow-xs"
                  />
                </div>

                {/* Category Selection with Custom Toggle */}
                <div>
                  <div className="flex items-center justify-between mb-1">
                    <label className="text-[11px] font-bold text-zinc-700">
                      Category
                    </label>
                    <button
                      type="button"
                      onClick={() => setCategoryMode(categoryMode === 'existing' ? 'custom' : 'existing')}
                      className="text-[10px] text-purple-600 hover:text-purple-800 font-semibold underline"
                    >
                      {categoryMode === 'existing' ? '+ Custom Category' : 'Select Existing'}
                    </button>
                  </div>

                  {categoryMode === 'existing' ? (
                    <select
                      value={selectedCategory}
                      onChange={(e) => setSelectedCategory(e.target.value)}
                      className="w-full bg-zinc-50 border border-zinc-200 rounded-xl px-3 py-2 text-xs text-zinc-900 focus:outline-none focus:border-purple-500 shadow-xs"
                    >
                      {existingCategories.map((c) => (
                        <option key={c} value={c}>
                          {c}
                        </option>
                      ))}
                    </select>
                  ) : (
                    <div className="relative">
                      <Tag className="w-3.5 h-3.5 text-zinc-400 absolute left-3 top-2.5" />
                      <input
                        type="text"
                        required
                        value={customCategory}
                        onChange={(e) => setCustomCategory(e.target.value)}
                        placeholder="e.g. Squash, Gym, Cultural"
                        className="w-full bg-zinc-50 border border-purple-300 rounded-xl pl-8 pr-3 py-2 text-xs text-zinc-900 focus:outline-none focus:ring-2 focus:ring-purple-500/20 focus:border-purple-500 shadow-xs"
                      />
                    </div>
                  )}
                </div>

                <div>
                  <label className="text-[11px] font-bold text-zinc-700 block mb-1">
                    Item Type
                  </label>
                  <select
                    value={newItemType}
                    onChange={(e) => setNewItemType(e.target.value as any)}
                    className="w-full bg-zinc-50 border border-zinc-200 rounded-xl px-3 py-2 text-xs text-zinc-900 focus:outline-none focus:border-purple-500 shadow-xs"
                  >
                    <option value="EQUIPMENT">Equipment (Gear)</option>
                    <option value="ROOM_KEY">Room Key (Space)</option>
                  </select>
                </div>

                <div>
                  <label className="text-[11px] font-bold text-zinc-700 block mb-1">
                    Total Quantity
                  </label>
                  <input
                    type="number"
                    min="1"
                    required
                    value={newItemTotalQty}
                    onChange={(e) => setNewItemTotalQty(Number(e.target.value))}
                    className="w-full bg-zinc-50 border border-zinc-200 rounded-xl px-3 py-2 text-xs text-zinc-900 focus:outline-none focus:border-purple-500 shadow-xs font-mono"
                  />
                </div>
              </div>

              <div className="flex justify-end gap-2 pt-2 border-t border-zinc-100">
                <button
                  type="button"
                  onClick={() => setIsAddingItem(false)}
                  className="px-4 py-2 rounded-xl text-xs font-semibold text-zinc-600 hover:text-zinc-900 hover:bg-zinc-100 transition"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isLoading}
                  className="px-5 py-2 rounded-xl text-xs font-bold text-white bg-zinc-900 hover:bg-zinc-800 transition shadow-xs"
                >
                  Save New Item
                </button>
              </div>
            </form>
          )}

          {/* Inventory Cards */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3.5">
            {inventory.map((item) => (
              <div
                key={item.id}
                className="rounded-2xl p-4 bg-white border border-[#E4E4E7] hover:border-zinc-300 transition shadow-xs hover:shadow-md flex flex-col justify-between"
              >
                <div>
                  <div className="flex items-center justify-between gap-2 mb-2">
                    <span className="text-[11px] font-semibold text-zinc-600 px-2.5 py-0.5 rounded-full bg-zinc-100 border border-zinc-200">
                      {item.category}
                    </span>
                    <span className="font-mono text-xs font-bold text-purple-700 bg-purple-50 px-2 py-0.5 rounded-md border border-purple-100">
                      {item.itemType}
                    </span>
                  </div>
                  <h4 className="font-bold text-base text-zinc-900">{item.name}</h4>

                  <div className="mt-3 flex items-center justify-between text-xs text-zinc-500">
                    <span>Available: <strong className="text-emerald-600 font-mono">{item.availableQty}</strong></span>
                    <span>Total Stock: <strong className="text-zinc-900 font-mono">{item.totalQty}</strong></span>
                  </div>
                </div>

                {/* Stock Controls */}
                <div className="mt-4 pt-3 border-t border-zinc-100 flex items-center justify-between">
                  <span className="text-xs text-zinc-500 font-medium">Adjust Total:</span>
                  <div className="flex items-center gap-1.5">
                    <button
                      onClick={() => handleUpdateStock(item, -1)}
                      disabled={item.totalQty <= 0}
                      className="w-7 h-7 rounded-lg bg-zinc-100 hover:bg-zinc-200 text-zinc-800 flex items-center justify-center transition border border-zinc-200 disabled:opacity-30 active:scale-95"
                    >
                      <Minus className="w-3 h-3" />
                    </button>
                    <span className="w-8 text-center font-mono font-bold text-xs text-zinc-900">
                      {item.totalQty}
                    </span>
                    <button
                      onClick={() => handleUpdateStock(item, 1)}
                      className="w-7 h-7 rounded-lg bg-zinc-900 hover:bg-zinc-800 text-white flex items-center justify-center transition shadow-xs active:scale-95"
                    >
                      <Plus className="w-3 h-3" />
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};
