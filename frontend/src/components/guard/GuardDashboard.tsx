import React, { useState, useEffect } from 'react';
import type { User, IssueRequest, ActiveBatch } from '../../types/index';
import { api } from '../../services/api';
import { socketService } from '../../services/socket';
import {
  Shield,
  Clock,
  Phone,
  CheckCircle2,
  AlertTriangle,
  RotateCcw,
  Search,
  Check,
  UserCheck,
  PackageCheck,
  RefreshCw
} from 'lucide-react';

interface GuardDashboardProps {
  currentUser: User;
}

// Queue Card with Ticking Timer
const QueueCard: React.FC<{
  request: IssueRequest;
  onApprove: (requestId: string) => void;
  isLoading: boolean;
}> = ({ request, onApprove, isLoading }) => {
  const calculateRemainingSeconds = () => {
    const expiresVal = request.expiresAt || (request as any).expires_at;
    const expiresAt = expiresVal ? new Date(expiresVal).getTime() : 0;
    const now = Date.now();
    return Math.max(0, Math.floor((expiresAt - now) / 1000));
  };

  const [remaining, setRemaining] = useState<number>(calculateRemainingSeconds());

  useEffect(() => {
    setRemaining(calculateRemainingSeconds());
    const interval = setInterval(() => {
      setRemaining(calculateRemainingSeconds());
    }, 1000);
    return () => clearInterval(interval);
  }, [request.expiresAt, (request as any).expires_at]);

  const minutes = Math.floor(remaining / 60);
  const seconds = remaining % 60;
  const timeFormatted = `${minutes}:${seconds < 10 ? '0' : ''}${seconds}`;
  const isUrgent = remaining <= 30;

  const studentName = request.studentName || (request as any).student_name || 'Student';
  const rollNo = request.rollNo || (request as any).roll_no || 'N/A';
  const mobileNo = request.mobileNo || (request as any).mobile_no;
  const items = request.requestedItems || (request as any).requested_items || (request as any).items || [];

  return (
    <div
      className={`rounded-2xl p-4 sm:p-5 border transition-all ${
        isUrgent
          ? 'bg-rose-50/90 border-rose-200 shadow-xs'
          : 'bg-white border-[#E4E4E7] hover:border-zinc-300 shadow-xs hover:shadow-md'
      }`}
    >
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        {/* Student Information */}
        <div className="flex items-start gap-3">
          <div className="w-10 h-10 rounded-xl bg-blue-50 text-blue-600 border border-blue-200 flex items-center justify-center font-bold">
            <UserCheck className="w-5 h-5" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h3 className="font-bold text-base text-zinc-900">
                {studentName}
              </h3>
              <span className="font-mono text-xs font-bold px-2 py-0.5 rounded-md bg-blue-50 text-blue-700 border border-blue-200">
                {rollNo}
              </span>
            </div>

            {mobileNo && (
              <a
                href={`tel:${mobileNo}`}
                className="inline-flex items-center gap-1.5 text-xs text-zinc-500 hover:text-emerald-700 mt-1 font-mono font-medium transition"
              >
                <Phone className="w-3.5 h-3.5" /> {mobileNo}
              </a>
            )}
          </div>
        </div>

        {/* 2:00 Countdown Badge */}
        <div className="flex items-center gap-2 self-start sm:self-auto">
          <div
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl font-mono text-sm font-extrabold border ${
              isUrgent
                ? 'bg-rose-100 text-rose-800 border-rose-200'
                : 'bg-amber-50 text-amber-800 border-amber-200'
            }`}
          >
            <Clock className="w-4 h-4" />
            <span>{timeFormatted}</span>
          </div>
        </div>
      </div>

      {/* Requested Items Preview */}
      <div className="mt-4 pt-3 border-t border-zinc-100">
        <span className="text-[10px] uppercase tracking-wider text-zinc-400 font-bold block mb-2">
          Requested Bundle:
        </span>
        <div className="flex flex-wrap gap-2">
          {items.map((item: any, idx: number) => {
            const itemName = item.name || item.itemName || 'Item';
            const itemQty = item.qty || item.quantity || 1;
            return (
              <span
                key={idx}
                className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-semibold bg-zinc-50 text-zinc-800 border border-zinc-200"
              >
                <PackageCheck className="w-3.5 h-3.5 text-blue-600" />
                {itemName} <strong className="text-zinc-900 font-mono">x{itemQty}</strong>
              </span>
            );
          })}
        </div>
      </div>

      {/* Accept Button */}
      <div className="mt-4 pt-3 flex items-center justify-end">
        <button
          onClick={() => onApprove(request.id)}
          disabled={isLoading || remaining <= 0}
          className="w-full sm:w-auto px-6 py-2.5 rounded-xl text-xs sm:text-sm font-bold text-white bg-emerald-600 hover:bg-emerald-500 active:scale-98 transition shadow-xs flex items-center justify-center gap-2 disabled:opacity-50"
        >
          <Check className="w-4 h-4" /> Accept & Issue Handout
        </button>
      </div>
    </div>
  );
};

export const GuardDashboard: React.FC<GuardDashboardProps> = ({ currentUser }) => {
  const [pendingRequests, setPendingRequests] = useState<IssueRequest[]>([]);
  const [activeBatches, setActiveBatches] = useState<ActiveBatch[]>([]);
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [isRefreshing, setIsRefreshing] = useState<boolean>(false);
  const [showRefreshedCheck, setShowRefreshedCheck] = useState<boolean>(false);
  const [actionMessage, setActionMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  const loadCounterData = async () => {
    try {
      const [queueData, registerData] = await Promise.all([
        api.getPendingRequests(),
        api.getActiveRegister()
      ]);
      setPendingRequests(queueData);
      setActiveBatches(registerData);
    } catch (err: any) {
      console.error('Failed to load guard desk data:', err);
    }
  };

  const handleManualRefresh = async () => {
    try {
      setIsRefreshing(true);
      await loadCounterData();
      setShowRefreshedCheck(true);
      setTimeout(() => setShowRefreshedCheck(false), 1500);
    } finally {
      setIsRefreshing(false);
    }
  };

  useEffect(() => {
    loadCounterData();
    // Join guard room
    socketService.joinGuard();

    const socket = socketService.socket;
    if (socket) {
      const handleRefresh = () => {
        loadCounterData();
      };

      socket.on('guard:queue_updated', handleRefresh);
      socket.on('guard:register_swapped', handleRefresh);
      socket.on('inventory:updated', handleRefresh);
      socket.on('transfer:state_changed', handleRefresh);
      socket.on('request:timed_out', handleRefresh);

      return () => {
        socket.off('guard:queue_updated', handleRefresh);
        socket.off('guard:register_swapped', handleRefresh);
        socket.off('inventory:updated', handleRefresh);
        socket.off('transfer:state_changed', handleRefresh);
        socket.off('request:timed_out', handleRefresh);
      };
    }
  }, []);

  // Accept / Approve Request
  const handleApprove = async (requestId: string) => {
    try {
      setIsLoading(true);
      setActionMessage(null);
      await api.approveRequest(requestId, currentUser.id);
      setActionMessage({ type: 'success', text: 'Request approved! Items registered as ISSUED.' });
      await loadCounterData();
    } catch (err: any) {
      setActionMessage({ type: 'error', text: err.message || 'Failed to approve request' });
    } finally {
      setIsLoading(false);
    }
  };

  // Return Batch Intact
  const handleReturnBatch = async (batchId: string) => {
    try {
      setIsLoading(true);
      setActionMessage(null);
      await api.returnBatchIntact(batchId);
      setActionMessage({ type: 'success', text: 'All items in batch returned intact.' });
      await loadCounterData();
    } catch (err: any) {
      setActionMessage({ type: 'error', text: err.message || 'Failed to return batch' });
    } finally {
      setIsLoading(false);
    }
  };

  // Return Single Unit Intact
  const handleReturnUnitIntact = async (entryId: string) => {
    try {
      setIsLoading(true);
      setActionMessage(null);
      await api.returnUnitIntact(entryId);
      setActionMessage({ type: 'success', text: 'Unit marked as returned intact.' });
      await loadCounterData();
    } catch (err: any) {
      setActionMessage({ type: 'error', text: err.message || 'Failed to return unit' });
    } finally {
      setIsLoading(false);
    }
  };

  // Mark Unit Damaged (Triggers Defaulter!)
  const handleReturnUnitDamaged = async (entryId: string) => {
    const confirmed = window.confirm(
      'Are you sure? Marking this item DAMAGED will instantly flag the student as an official SAC Defaulter!'
    );
    if (!confirmed) return;

    try {
      setIsLoading(true);
      setActionMessage(null);
      await api.returnUnitDamaged(entryId);
      setActionMessage({
        type: 'success',
        text: 'Unit marked DAMAGED. Student account has been flagged as SAC Defaulter.'
      });
      await loadCounterData();
    } catch (err: any) {
      setActionMessage({ type: 'error', text: err.message || 'Failed to record damaged item' });
    } finally {
      setIsLoading(false);
    }
  };

  // Filter Active Batches
  const filteredBatches = activeBatches.filter((batch) => {
    const q = searchQuery.toLowerCase().trim();
    if (!q) return true;
    return (
      batch.studentName.toLowerCase().includes(q) ||
      batch.rollNo.toLowerCase().includes(q) ||
      batch.batchId.toLowerCase().includes(q) ||
      batch.units.some((u) => u.itemName.toLowerCase().includes(q) || u.category.toLowerCase().includes(q))
    );
  });

  // Filter Incoming Arrival Queue
  const filteredRequests = pendingRequests.filter((req) => {
    const q = searchQuery.toLowerCase().trim();
    if (!q) return true;
    const name = (req.studentName || (req as any).student_name || '').toLowerCase();
    const roll = (req.rollNo || (req as any).roll_no || '').toLowerCase();
    const phone = (req.mobileNo || (req as any).mobile_no || '').toLowerCase();
    const items = req.requestedItems || (req as any).requested_items || (req as any).items || [];
    const itemMatch = items.some((i: any) => (i.name || i.itemName || '').toLowerCase().includes(q));
    return name.includes(q) || roll.includes(q) || phone.includes(q) || itemMatch;
  });

  const totalActiveUnits = activeBatches.reduce((acc, b) => acc + b.units.length, 0);

  return (
    <div className="max-w-7xl mx-auto px-4 py-6 space-y-6 pb-20">
      {/* Guard Header & Stats Bar */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <span className="p-2 rounded-xl bg-amber-50 text-amber-700 border border-amber-200">
              <Shield className="w-5 h-5" />
            </span>
            <h1 className="text-2xl sm:text-3xl font-extrabold text-zinc-900 tracking-tight">
              SAC Guard Counter Desk
            </h1>
          </div>
          <p className="text-xs sm:text-sm text-zinc-500 mt-1">
            Logged in operator: <strong className="text-zinc-800">{currentUser.name}</strong>
          </p>
        </div>

        {/* Quick Stats Pill */}
        <div className="flex items-center gap-2 sm:gap-3">
          <div className="px-4 py-2 rounded-2xl bg-white border border-[#E4E4E7] shadow-xs text-center">
            <span className="text-[10px] uppercase font-bold text-zinc-400 block">
              Waiting in Queue
            </span>
            <span className="font-mono text-lg font-bold text-blue-600">
              {pendingRequests.length}
            </span>
          </div>

          <div className="px-4 py-2 rounded-2xl bg-white border border-[#E4E4E7] shadow-xs text-center">
            <span className="text-[10px] uppercase font-bold text-zinc-400 block">
              Active Batches
            </span>
            <span className="font-mono text-lg font-bold text-emerald-600">
              {activeBatches.length}
            </span>
          </div>

          <div className="px-4 py-2 rounded-2xl bg-white border border-[#E4E4E7] shadow-xs text-center">
            <span className="text-[10px] uppercase font-bold text-zinc-400 block">
              Units Issued
            </span>
            <span className="font-mono text-lg font-bold text-zinc-900">
              {totalActiveUnits}
            </span>
          </div>

          <button
            onClick={handleManualRefresh}
            disabled={isRefreshing}
            className={`p-2.5 rounded-2xl border shadow-xs transition flex items-center gap-1.5 active:scale-95 ${
              showRefreshedCheck
                ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                : 'bg-white hover:bg-zinc-50 text-zinc-700 border-[#E4E4E7]'
            }`}
            title="Refresh Guard Desk"
          >
            {showRefreshedCheck ? (
              <>
                <Check className="w-4 h-4 text-emerald-600" />
                <span className="text-xs font-semibold">Refreshed ✓</span>
              </>
            ) : (
              <RefreshCw className={`w-4 h-4 ${isRefreshing ? 'animate-spin text-blue-600' : ''}`} />
            )}
          </button>
        </div>
      </div>

      {/* Notification Toast */}
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

      {/* Responsive Grid: Queue (Left) & Active Register (Right) */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Left Column: Incoming 2-Minute Queue */}
        <section className="lg:col-span-5 space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-base font-bold text-zinc-900 tracking-tight flex items-center gap-2">
              <Clock className="w-4 h-4 text-blue-600" />
              Incoming Arrival Queue ({pendingRequests.length})
            </h2>
            <span className="text-xs text-zinc-400 font-mono font-medium">
              2:00 TTL
            </span>
          </div>

          {pendingRequests.length === 0 ? (
            <div className="rounded-2xl p-8 bg-white border border-[#E4E4E7] text-center shadow-xs">
              <PackageCheck className="w-8 h-8 text-zinc-300 mx-auto mb-2" />
              <h3 className="text-sm font-bold text-zinc-800">
                Counter Queue Clear
              </h3>
              <p className="text-xs text-zinc-500 mt-1">
                No students currently waiting for desk approval.
              </p>
            </div>
          ) : filteredRequests.length === 0 ? (
            <div className="rounded-2xl p-8 bg-white border border-[#E4E4E7] text-center shadow-xs">
              <PackageCheck className="w-8 h-8 text-zinc-300 mx-auto mb-2" />
              <h3 className="text-sm font-bold text-zinc-800">
                No Matching Arrival Requests
              </h3>
              <p className="text-xs text-zinc-500 mt-1">
                No incoming students match "{searchQuery}".
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              {filteredRequests.map((req) => (
                <QueueCard
                  key={req.id}
                  request={req}
                  onApprove={handleApprove}
                  isLoading={isLoading}
                />
              ))}
            </div>
          )}
        </section>

        {/* Right Column: Active Issued Register */}
        <section className="lg:col-span-7 space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <h2 className="text-base font-bold text-zinc-900 tracking-tight flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 text-emerald-600" />
              Active Issued Register ({activeBatches.length} Groups)
            </h2>

            {/* Search Bar */}
            <div className="relative w-full sm:w-64">
              <Search className="w-4 h-4 text-zinc-400 absolute left-3 top-2.5" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search Roll No, Name, Item..."
                className="w-full bg-white border border-[#E4E4E7] rounded-xl pl-9 pr-3 py-1.5 text-xs text-zinc-900 placeholder:text-zinc-400 focus:outline-none focus:ring-2 focus:ring-blue-600/20 focus:border-blue-600 shadow-xs"
              />
            </div>
          </div>

          {filteredBatches.length === 0 ? (
            <div className="rounded-2xl p-8 bg-white border border-[#E4E4E7] text-center shadow-xs">
              <Shield className="w-8 h-8 text-zinc-300 mx-auto mb-2" />
              <h3 className="text-sm font-bold text-zinc-800">
                No Active Checkouts
              </h3>
              <p className="text-xs text-zinc-500 mt-1">
                {searchQuery ? 'No batches match your search filter.' : 'All items are currently safely returned.'}
              </p>
            </div>
          ) : (
            <div className="space-y-4">
              {filteredBatches.map((batch) => (
                <div
                  key={batch.batchId}
                  className="rounded-2xl p-5 bg-white border border-[#E4E4E7] hover:border-zinc-300 transition shadow-xs hover:shadow-md"
                >
                  {/* Batch Header */}
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-zinc-100">
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-bold text-base text-zinc-900">
                          {batch.studentName}
                        </span>
                        <span className="font-mono text-xs font-bold px-2 py-0.5 rounded-md bg-blue-50 text-blue-700 border border-blue-200">
                          {batch.rollNo}
                        </span>
                      </div>

                      <div className="flex flex-wrap items-center gap-3 mt-1 text-xs text-zinc-500">
                        {batch.mobileNo && (
                          <a
                            href={`tel:${batch.mobileNo}`}
                            className="inline-flex items-center gap-1 text-emerald-700 hover:text-emerald-800 font-mono font-bold underline"
                            title="1-Tap Call Student"
                          >
                            <Phone className="w-3.5 h-3.5" /> {batch.mobileNo}
                          </a>
                        )}
                        <span>
                          Issued: {new Date(batch.arrivalTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                        </span>
                        <span className="font-mono text-[11px] text-zinc-400">
                          Batch: {batch.batchId.slice(0, 8)}...
                        </span>
                      </div>
                    </div>

                    {/* Batch "Return All (Intact)" Button */}
                    <button
                      onClick={() => handleReturnBatch(batch.batchId)}
                      disabled={isLoading}
                      className="px-4 py-2 rounded-xl text-xs font-bold text-zinc-800 bg-zinc-100 hover:bg-emerald-600 hover:text-white border border-zinc-200 hover:border-emerald-500 transition shadow-xs flex items-center gap-1.5 self-start sm:self-auto"
                    >
                      <RotateCcw className="w-3.5 h-3.5" /> Return All (Intact)
                    </button>
                  </div>

                  {/* Units List */}
                  <div className="mt-3 space-y-2">
                    <span className="text-[10px] uppercase tracking-wider text-zinc-400 font-bold block">
                      Individual Units ({batch.units.length}):
                    </span>
                    <div className="space-y-1.5">
                      {batch.units.map((unit) => {
                        const isPendingTransfer = unit.status === 'ISSUED_TRANSFER_PENDING';
                        return (
                          <div
                            key={unit.id}
                            className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 p-2.5 rounded-xl bg-zinc-50/70 border border-zinc-200/70 text-xs"
                          >
                            <div className="flex items-center gap-2">
                              <span className="font-semibold text-zinc-900">{unit.itemName}</span>
                              <span className="text-zinc-500">({unit.category})</span>
                              {isPendingTransfer && (
                                <span className="text-[10px] px-2 py-0.5 rounded-full bg-amber-100 text-amber-800 border border-amber-200 font-semibold">
                                  Transfer Pending
                                </span>
                              )}
                            </div>

                            <div className="flex items-center gap-1.5 self-end sm:self-auto">
                              <button
                                onClick={() => handleReturnUnitIntact(unit.id)}
                                disabled={isLoading}
                                className="px-2.5 py-1 rounded-lg text-[11px] font-semibold bg-emerald-50 hover:bg-emerald-100 text-emerald-700 border border-emerald-200 transition flex items-center gap-1"
                              >
                                <Check className="w-3 h-3" /> Returned
                              </button>
                              <button
                                onClick={() => handleReturnUnitDamaged(unit.id)}
                                disabled={isLoading}
                                className="px-2.5 py-1 rounded-lg text-[11px] font-semibold bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-200 transition flex items-center gap-1"
                                title="Report Damaged (Flags Student as Defaulter)"
                              >
                                <AlertTriangle className="w-3 h-3" /> Damaged
                              </button>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>
      </div>
    </div>
  );
};
