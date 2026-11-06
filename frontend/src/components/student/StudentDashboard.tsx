import React, { useState, useEffect, useCallback } from 'react';
import type {
  IncomingTransfer,
  IssueRequest,
  RegisterEntryUnit,
  SACItem,
  User
} from '../../types/index';
import { api } from '../../services/api';
import { socketService } from '../../services/socket';
import { StudentBanners } from './StudentBanners';
import { PendingRequestTracker } from './PendingRequestTracker';
import { ActiveHoldingsList } from './ActiveHoldingsList';
import { LiveCampusFeed } from './LiveCampusFeed';
import { StickyIssueBar } from './StickyIssueBar';
import { IssueConfirmModal } from './IssueConfirmModal';
import { Check, RefreshCw } from 'lucide-react';

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

  const loadData = useCallback(async () => {
    try {
      setErrorMsg(null);
      const [inventoryData, holdingsData, transfersData, myPendingList] =
        await Promise.all([
          api.getInventory(),
          api.getStudentHoldings(currentUser.id),
          api.getIncomingTransfers(currentUser.id),
          api.getMyPendingRequests()
        ]);

      setItems(inventoryData);
      setHoldings(holdingsData);
      setIncomingTransfers(transfersData);

      const now = Date.now();
      const myPending = myPendingList.find(
        (r) =>
          r.studentId === currentUser.id &&
          r.status === 'PENDING' &&
          new Date(r.expiresAt).getTime() > now
      );
      setPendingRequest(myPending || null);
    } catch (err: any) {
      setErrorMsg(err.message || 'Failed to load SAC inventory data.');
    }
  }, [currentUser.id]);

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
    const socket = socketService.connect();

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
        onRefreshUser();
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
  }, [currentUser.id, loadData, onRefreshUser]);

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

  const selectedItemsList = Object.entries(selectedCounts)
    .map(([itemId, qty]) => ({
      item: items.find((i) => i.id === itemId)!,
      qty
    }))
    .filter((s) => Boolean(s.item));

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
      await loadData();
    } catch (err: any) {
      setErrorMsg(err.message || 'Failed to submit issue request.');
    } finally {
      setIsLoading(false);
    }
  };

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
      setErrorMsg(err.message || 'Failed to accept transfer.');
    }
  };

  const handleDeclineTransfer = async (entryId: string) => {
    try {
      await api.respondTransfer(entryId, currentUser.id, 'REJECT');
      await loadData();
    } catch (err: any) {
      setErrorMsg(err.message || 'Failed to decline transfer.');
    }
  };

  const isBlocked =
    currentUser.isDefaulter ||
    Boolean(
      currentUser.penaltyUntil && new Date(currentUser.penaltyUntil) > new Date()
    );

  return (
    <div className="max-w-5xl mx-auto px-4 py-6 space-y-5 pb-24">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h1 className="text-lg font-semibold text-zinc-900 tracking-tight">
            Campus Equipment & Room Status
          </h1>
          <p className="text-xs text-zinc-500">
            {currentUser.name} · <span className="font-mono">{currentUser.rollNo}</span>
          </p>
        </div>

        <button
          onClick={handleManualRefresh}
          disabled={isRefreshing}
          className="px-3 py-1.5 rounded-md text-xs font-medium border border-zinc-200 bg-white hover:bg-zinc-50 text-zinc-700 transition inline-flex items-center gap-1.5"
        >
          {showRefreshedCheck ? (
            <>
              <Check className="w-3.5 h-3.5 text-emerald-600" />
              <span>Synced</span>
            </>
          ) : (
            <>
              <RefreshCw className={`w-3.5 h-3.5 ${isRefreshing ? 'animate-spin' : ''}`} />
              <span>Refresh</span>
            </>
          )}
        </button>
      </div>

      {errorMsg && (
        <div className="p-3 rounded-lg bg-red-50 border border-red-200 text-red-700 text-xs">
          {errorMsg}
        </div>
      )}

      <StudentBanners
        user={currentUser}
        incomingTransfers={incomingTransfers}
        onAcceptTransfer={handleAcceptTransfer}
        onDeclineTransfer={handleDeclineTransfer}
      />

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

      <ActiveHoldingsList
        holdings={holdings}
        currentStudentRollNo={currentUser.rollNo}
        onInitiateTransfer={handleInitiateTransfer}
        onCancelTransfer={handleCancelTransfer}
        isLoading={isLoading}
      />

      <LiveCampusFeed
        items={items}
        selectedCounts={selectedCounts}
        onIncrement={handleIncrement}
        onDecrement={handleDecrement}
        disabled={isBlocked || Boolean(pendingRequest)}
      />

      <StickyIssueBar
        selectedItems={selectedItemsList}
        onOpenConfirmModal={() => setIsConfirmModalOpen(true)}
        onClear={() => setSelectedCounts({})}
        disabled={isBlocked || Boolean(pendingRequest)}
      />

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
