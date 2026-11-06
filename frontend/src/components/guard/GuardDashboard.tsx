import React, { useState, useEffect, useCallback } from 'react';
import type { ActiveBatch, IssueRequest, SACItem, User } from '../../types/index';
import { api } from '../../services/api';
import { socketService } from '../../services/socket';
import { GuardQueuePanel } from './GuardQueuePanel';
import { ActiveRegisterTable } from './ActiveRegisterTable';
import { FacultyRoomBar } from './FacultyRoomBar';
import { Check, RefreshCw } from 'lucide-react';

interface GuardDashboardProps {
  currentUser: User;
}

export const GuardDashboard: React.FC<GuardDashboardProps> = ({ currentUser }) => {
  const [pendingRequests, setPendingRequests] = useState<IssueRequest[]>([]);
  const [activeBatches, setActiveBatches] = useState<ActiveBatch[]>([]);
  const [rooms, setRooms] = useState<SACItem[]>([]);
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [isActionPending, setIsActionPending] = useState<boolean>(false);
  const [isRefreshing, setIsRefreshing] = useState<boolean>(false);
  const [showRefreshedCheck, setShowRefreshedCheck] = useState<boolean>(false);
  const [actionMessage, setActionMessage] = useState<{
    type: 'success' | 'error';
    text: string;
  } | null>(null);

  const loadCounterData = useCallback(async () => {
    try {
      const [queueData, registerData, invData] = await Promise.all([
        api.getPendingRequests(),
        api.getActiveRegister(),
        api.getInventory()
      ]);
      const now = Date.now();
      setPendingRequests(
        queueData.filter(
          (r) => r.status === 'PENDING' && new Date(r.expiresAt).getTime() > now
        )
      );
      setActiveBatches(registerData);
      setRooms(invData.filter((i) => i.itemType === 'ROOM_KEY'));
    } catch (err: any) {
      setActionMessage({
        type: 'error',
        text: err.message || 'Failed to load counter register.'
      });
    }
  }, []);

  useEffect(() => {
    loadCounterData();
    const socket = socketService.connect();

    const handleSync = () => {
      loadCounterData();
    };

    socket.on('guard:queue_updated', handleSync);
    socket.on('transfer:state_changed', handleSync);
    socket.on('guard:register_swapped', handleSync);
    socket.on('request:timed_out', handleSync);
    socket.on('inventory:updated', handleSync);

    return () => {
      socket.off('guard:queue_updated', handleSync);
      socket.off('transfer:state_changed', handleSync);
      socket.off('guard:register_swapped', handleSync);
      socket.off('request:timed_out', handleSync);
      socket.off('inventory:updated', handleSync);
    };
  }, [loadCounterData]);

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

  const runCounterAction = async (
    fn: () => Promise<void>,
    successText: string
  ) => {
    try {
      setIsActionPending(true);
      setActionMessage(null);
      await fn();
      setActionMessage({ type: 'success', text: successText });
      await loadCounterData();
    } catch (err: any) {
      setActionMessage({
        type: 'error',
        text: err.message || 'Counter operation failed.'
      });
    } finally {
      setIsActionPending(false);
    }
  };

  return (
    <div className="max-w-7xl mx-auto px-4 py-6 space-y-5">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h1 className="text-lg font-semibold text-zinc-900 tracking-tight">
            SAC Counter Desk
          </h1>
          <p className="text-xs text-zinc-500">
            Operator: <span className="text-zinc-800">{currentUser.name}</span>
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

      {actionMessage && (
        <div
          className={`p-3 rounded-lg text-xs border ${
            actionMessage.type === 'success'
              ? 'bg-emerald-50 border-emerald-200 text-emerald-900'
              : 'bg-red-50 border-red-200 text-red-700'
          }`}
        >
          {actionMessage.text}
        </div>
      )}

      <FacultyRoomBar
        rooms={rooms}
        onFacultyOccupy={(roomId, roomName) =>
          runCounterAction(
            () => api.occupyRoomForFaculty(roomId),
            `${roomName} marked occupied for faculty / event.`
          )
        }
        onReleaseRoom={(roomId, roomName) =>
          runCounterAction(
            () => api.releaseRoom(roomId),
            `${roomName} key released to available pool.`
          )
        }
        disabled={isActionPending}
      />

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-start">
        <div className="lg:col-span-4">
          <GuardQueuePanel
            requests={pendingRequests}
            onApprove={(requestId) =>
              runCounterAction(
                () => api.approveRequest(requestId, currentUser.id),
                'Request approved and physical units logged.'
              )
            }
            isLoading={isActionPending}
          />
        </div>

        <div className="lg:col-span-8">
          <ActiveRegisterTable
            batches={activeBatches}
            searchQuery={searchQuery}
            onSearchChange={setSearchQuery}
            onReturnUnitIntact={(entryId) =>
              runCounterAction(
                () => api.returnUnitIntact(entryId),
                'Unit returned intact and restored to stock.'
              )
            }
            onReturnBatchIntact={(batchId) =>
              runCounterAction(
                () => api.returnBatchIntact(batchId),
                'All active units in batch returned intact.'
              )
            }
            onReturnUnitDamaged={(entryId) =>
              runCounterAction(
                () => api.returnUnitDamaged(entryId),
                'Unit logged as damaged; student holder restricted as defaulter.'
              )
            }
            isLoading={isActionPending}
          />
        </div>
      </div>
    </div>
  );
};
