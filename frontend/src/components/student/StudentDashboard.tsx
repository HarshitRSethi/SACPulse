import React, { useState, useEffect } from 'react';
import type { User, SACItem, IssueRequest, RegisterEntryUnit, IncomingTransfer } from '../../types/index';
import { api } from '../../services/api';
import { socketService } from '../../services/socket';
import { StudentBanners } from './StudentBanners';
import { PendingRequestTracker } from './PendingRequestTracker';
import { ActiveHoldingsList } from './ActiveHoldingsList';
import { LiveCampusFeed } from './LiveCampusFeed';
import { StickyIssueBar } from './StickyIssueBar';
import { IssueConfirmModal } from './IssueConfirmModal';
import { RefreshCw, Check } from 'lucide-react';

interface StudentDashboardProps {
  currentUser: User;
  onRefreshUser: () => Promise<void>;
}

export const StudentDashboard: React.FC<StudentDashboardProps> = ({
  currentUser,
  onRefreshUser
}) => {
  const [items, setItems] = useState<SACItem[]>([]);
  const [selectedCounts, setSelectedCounts] = useState<Record<string, number>>({});
  const [holdings, setHoldings] = useState<RegisterEntryUnit[]>([]);
  const [incomingTransfers, setIncomingTransfers] = useState<IncomingTransfer[]>([]);
  const [pendingRequest, setPendingRequest] = useState<IssueRequest | null>(null);
  const [isConfirmModalOpen, setIsConfirmModalOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [showRefreshedCheck, setShowRefreshedCheck] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Load Inventory, Holdings, Incoming Transfers, and Pending Requests
  const loadData = async () => {
    try {
      setErrorMsg(null);
      const [inventoryData, holdingsData, transfersData, pendingRequests] = await Promise.all([
        api.getInventory(),
        api.getStudentHoldings(currentUser.id),
        api.getIncomingTransfers(currentUser.id),
        api.getPendingRequests()
      ]);

      setItems(inventoryData);
      setHoldings(holdingsData);
      setIncomingTransfers(transfersData);

      // Check if this student has an active pending request (strictly unexpired)
      const now = Date.now();
      const myPending = pendingRequests.find(
        (r) =>
          r.studentId === currentUser.id &&
          r.status === 'PENDING' &&
          new Date(r.expiresAt).getTime() > now
      );
      setPendingRequest(myPending || null);
    } catch (err: any) {
      console.error('Failed to load student dashboard data:', err);
      setErrorMsg(err.message || 'Failed to load SAC data');
    }
  };

  const handleManualRefresh = async () => {
    try {
      setIsRefreshing(true);
      await Promise.all([loadData(), onRefreshUser()]);
      setShowRefreshedCheck(true);
      setTimeout(() => setShowRefreshedCheck(false), 1500);
    } finally {
      setIsRefreshing(false);
    }
  };

  useEffect(() => {
    loadData();
    // Join student socket room
    socketService.joinStudent(currentUser.id);

    // Socket real-time listeners
    const socket = socketService.socket;
    if (socket) {
      const handleInventoryUpdated = () => {
        api.getInventory().then(setItems).catch(console.error);
      };

      const handleQueueUpdated = () => {
        loadData();
      };

      const handleTransferChanged = () => {
        api.getIncomingTransfers(currentUser.id).then(setIncomingTransfers).catch(console.error);
        api.getStudentHoldings(currentUser.id).then(setHoldings).catch(console.error);
      };

      const handleRequestTimedOut = (data: { requestId: string; studentId: string }) => {
        if (data.studentId === currentUser.id) {
          setPendingRequest(null);
          loadData();
          onRefreshUser(); // update penalty status if strikes > 3
        }
      };

      socket.on('inventory:updated', handleInventoryUpdated);
      socket.on('guard:queue_updated', handleQueueUpdated);
      socket.on('transfer:state_changed', handleTransferChanged);
      socket.on('guard:register_swapped', handleTransferChanged);
      socket.on('request:timed_out', handleRequestTimedOut);

      return () => {
        socket.off('inventory:updated', handleInventoryUpdated);
        socket.off('guard:queue_updated', handleQueueUpdated);
        socket.off('transfer:state_changed', handleTransferChanged);
        socket.off('guard:register_swapped', handleTransferChanged);
        socket.off('request:timed_out', handleRequestTimedOut);
      };
    }
  }, [currentUser.id]);

  // Handle Steppers
  const handleIncrement = (item: SACItem) => {
    setSelectedCounts((prev) => {
      const current = prev[item.id] || 0;
      if (current >= item.availableQty) return prev;
      return { ...prev, [item.id]: current + 1 };
    });
  };

  const handleDecrement = (item: SACItem) => {
    setSelectedCounts((prev) => {
      const current = prev[item.id] || 0;
      if (current <= 1) {
        const next = { ...prev };
        delete next[item.id];
        return next;
      }
      return { ...prev, [item.id]: current - 1 };
    });
  };

  const handleClearSelection = () => {
    setSelectedCounts({});
  };

  // Convert selected map to list for modal & sticky bar
  const selectedItemsList = Object.entries(selectedCounts).map(([itemId, qty]) => {
    const item = items.find((i) => i.id === itemId)!;
    return { item, qty };
  }).filter((s) => Boolean(s.item));

  // Submit Issue Request
  const handleConfirmIssue = async () => {
    try {
      setIsLoading(true);
      setErrorMsg(null);
      const itemsPayload = selectedItemsList.map((s) => ({
        itemId: s.item.id,
        name: s.item.name,
        qty: s.qty
      }));

      const newRequest = await api.createIssueRequest(currentUser.id, itemsPayload);
      setPendingRequest(newRequest);
      setSelectedCounts({});
      setIsConfirmModalOpen(false);
      // Reload inventory & user
      await loadData();
    } catch (err: any) {
      setErrorMsg(err.message || 'Failed to submit issue request');
    } finally {
      setIsLoading(false);
    }
  };

  // Transfer Actions
  const handleInitiateTransfer = async (entryId: string, recipientRollNo: string) => {
    await api.initiateTransfer(entryId, currentUser.id, recipientRollNo);
    await loadData();
  };

  const handleCancelTransfer = async (entryId: string) => {
    await api.cancelTransfer(entryId, currentUser.id);
    await loadData();
  };

  const handleAcceptTransfer = async (entryId: string) => {
    try {
      await api.respondTransfer(entryId, currentUser.id, 'ACCEPT');
      await loadData();
    } catch (err: any) {
      setErrorMsg(err.message || 'Failed to accept transfer');
    }
  };

  const handleDeclineTransfer = async (entryId: string) => {
    try {
      await api.respondTransfer(entryId, currentUser.id, 'REJECT');
      await loadData();
    } catch (err: any) {
      setErrorMsg(err.message || 'Failed to decline transfer');
    }
  };

  const isBlocked = currentUser.isDefaulter || Boolean(currentUser.penaltyUntil && new Date(currentUser.penaltyUntil) > new Date());

  return (
    <div className="max-w-5xl mx-auto px-4 py-6 space-y-6 pb-28">
      {/* Student Welcome Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl sm:text-3xl font-extrabold text-zinc-900 tracking-tight flex items-center gap-2">
            Student Dashboard
          </h1>
          <p className="text-xs sm:text-sm text-zinc-500 mt-0.5">
            Logged in as <strong className="text-zinc-800">{currentUser.name}</strong> ({currentUser.rollNo})
          </p>
        </div>

        <button
          onClick={handleManualRefresh}
          disabled={isRefreshing}
          className={`self-start sm:self-auto px-3.5 py-1.5 rounded-xl text-xs font-semibold border shadow-xs transition-all flex items-center gap-1.5 active:scale-95 ${
            showRefreshedCheck
              ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
              : 'bg-white hover:bg-zinc-50 text-zinc-700 border-[#E4E4E7]'
          }`}
        >
          {showRefreshedCheck ? (
            <>
              <Check className="w-3.5 h-3.5 text-emerald-600" />
              <span>Refreshed ✓</span>
            </>
          ) : (
            <>
              <RefreshCw className={`w-3.5 h-3.5 ${isRefreshing ? 'animate-spin text-blue-600' : ''}`} />
              <span>{isRefreshing ? 'Refreshing...' : 'Refresh Status'}</span>
            </>
          )}
        </button>
      </div>

      {/* Global Error Banner */}
      {errorMsg && (
        <div className="p-3.5 rounded-2xl bg-rose-50 border border-rose-200 text-rose-800 text-xs font-medium">
          {errorMsg}
        </div>
      )}

      {/* Banners: Defaulter, Cooldown, Incoming Transfers */}
      <StudentBanners
        user={currentUser}
        incomingTransfers={incomingTransfers}
        onAcceptTransfer={handleAcceptTransfer}
        onDeclineTransfer={handleDeclineTransfer}
      />

      {/* 2:00 Countdown Pending Request Tracker */}
      {pendingRequest && (
        <PendingRequestTracker
          request={pendingRequest}
          onTimedOut={() => {
            setPendingRequest(null);
            loadData();
            onRefreshUser();
          }}
        />
      )}

      {/* Active Holdings with Peer Transfer */}
      <ActiveHoldingsList
        holdings={holdings}
        currentStudentRollNo={currentUser.rollNo}
        onInitiateTransfer={handleInitiateTransfer}
        onCancelTransfer={handleCancelTransfer}
        isLoading={isLoading}
      />

      {/* Live Campus Feed: Equipment & Activity Rooms */}
      <div className="pt-2 space-y-3">
        <div>
          <h2 className="text-lg font-bold text-zinc-900 tracking-tight">
            Live Campus Feed
          </h2>
          <p className="text-xs text-zinc-500">
            Real-time equipment availability and activity room occupancy status.
          </p>
        </div>

        <LiveCampusFeed
          items={items}
          selectedCounts={selectedCounts}
          onIncrement={handleIncrement}
          onDecrement={handleDecrement}
          disabled={isBlocked || Boolean(pendingRequest)}
        />
      </div>

      {/* Sticky Bottom Bar */}
      <StickyIssueBar
        selectedItems={selectedItemsList}
        onOpenConfirmModal={() => setIsConfirmModalOpen(true)}
        onClear={handleClearSelection}
        disabled={isBlocked || Boolean(pendingRequest)}
      />

      {/* 2-Step Confirmation Modal */}
      <IssueConfirmModal
        isOpen={isConfirmModalOpen}
        onClose={() => setIsConfirmModalOpen(false)}
        onConfirm={handleConfirmIssue}
        selectedItems={selectedItemsList}
        isLoading={isLoading}
      />
    </div>
  );
};
