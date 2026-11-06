import React, { useState, useEffect, useCallback, useMemo } from 'react';
import type { SACItem, User } from '../../types/index';
import { api } from '../../services/api';
import { socketService } from '../../services/socket';
import { AdminMetricsStrip } from './AdminMetricsStrip';
import { MasterRegisterTab } from './MasterRegisterTab';
import { RestrictionsTab } from './RestrictionsTab';
import { InventoryManagerTab } from './InventoryManagerTab';
import { StaffWhitelistTab } from './StaffWhitelistTab';
import { Check, RefreshCw } from 'lucide-react';

interface AdminDashboardProps {
  currentUser: User;
}

type AdminTabKey = 'register' | 'restrictions' | 'inventory' | 'whitelist';

export const AdminDashboard: React.FC<AdminDashboardProps> = ({ currentUser }) => {
  const [activeTab, setActiveTab] = useState<AdminTabKey>('register');
  const [registerLogs, setRegisterLogs] = useState<any[]>([]);
  const [statusFilter, setStatusFilter] = useState<string>('ALL');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [currentPage, setCurrentPage] = useState<number>(1);
  const [totalPages, setTotalPages] = useState<number>(1);
  const [totalCount, setTotalCount] = useState<number>(0);
  const [todayCount, setTodayCount] = useState<number>(0);

  const [users, setUsers] = useState<User[]>([]);
  const [inventory, setInventory] = useState<SACItem[]>([]);
  const [pendingRequests, setPendingRequests] = useState<any[]>([]);
  const [activeWhitelistedUsers, setActiveWhitelistedUsers] = useState<any[]>([]);
  const [initialAdminEmail, setInitialAdminEmail] = useState<string>('');

  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [isExportingCsv, setIsExportingCsv] = useState<boolean>(false);
  const [isRefreshing, setIsRefreshing] = useState<boolean>(false);
  const [showRefreshedCheck, setShowRefreshedCheck] = useState<boolean>(false);
  const [whitelistActionLoading, setWhitelistActionLoading] = useState<string | null>(
    null
  );
  const [actionMessage, setActionMessage] = useState<{
    type: 'success' | 'error';
    text: string;
  } | null>(null);

  const isRootAdmin = Boolean(
    currentUser.isRootAdmin ||
      (initialAdminEmail &&
        currentUser.email.toLowerCase().trim() ===
          initialAdminEmail.toLowerCase().trim())
  );

  const loadData = useCallback(
    async (targetPage: number = currentPage, targetStatus: string = statusFilter) => {
      try {
        setIsLoading(true);
        const [logsRes, usersData, invData, whitelistData] = await Promise.all([
          api.getAdminLogs({ status: targetStatus, page: targetPage, limit: 25 }),
          api.getAllUsers(),
          api.getInventory(),
          api.getAdminWhitelist().catch(() => ({
            pendingRequests: [],
            activeUsers: [],
            initialAdminEmail: ''
          }))
        ]);

        setRegisterLogs(logsRes.logs);
        setTotalCount(logsRes.totalCount);
        setTodayCount(logsRes.todayCount);
        setTotalPages(logsRes.totalPages);
        setCurrentPage(logsRes.currentPage);
        setUsers(usersData);
        setInventory(invData);
        setPendingRequests(whitelistData.pendingRequests || []);
        setActiveWhitelistedUsers(whitelistData.activeUsers || []);
        if (whitelistData.initialAdminEmail) {
          setInitialAdminEmail(whitelistData.initialAdminEmail);
        }
      } catch (err: any) {
        setActionMessage({
          type: 'error',
          text: err.message || 'Failed to load administration data.'
        });
      } finally {
        setIsLoading(false);
      }
    },
    [currentPage, statusFilter]
  );

  useEffect(() => {
    loadData(1, statusFilter);
  }, [statusFilter]);

  useEffect(() => {
    const socket = socketService.connect();

    const handleSync = () => {
      loadData(currentPage, statusFilter);
    };

    socket.on('inventory:updated', handleSync);
    socket.on('guard:queue_updated', handleSync);
    socket.on('transfer:state_changed', handleSync);
    socket.on('guard:register_swapped', handleSync);

    return () => {
      socket.off('inventory:updated', handleSync);
      socket.off('guard:queue_updated', handleSync);
      socket.off('transfer:state_changed', handleSync);
      socket.off('guard:register_swapped', handleSync);
    };
  }, [currentPage, statusFilter, loadData]);

  const restrictedCount = useMemo(() => {
    const now = Date.now();
    return users.filter(
      (u) =>
        u.role === 'STUDENT' &&
        (u.isDefaulter ||
          (u.penaltyUntil && new Date(u.penaltyUntil).getTime() > now))
    ).length;
  }, [users]);

  const handleManualRefresh = async () => {
    try {
      setIsRefreshing(true);
      await loadData(currentPage, statusFilter);
      setShowRefreshedCheck(true);
      setTimeout(() => setShowRefreshedCheck(false), 1500);
    } finally {
      setIsRefreshing(false);
    }
  };

  const handleExportCsv = async () => {
    try {
      setIsExportingCsv(true);
      await api.downloadAdminLogsCsv(statusFilter);
    } catch (err: any) {
      setActionMessage({
        type: 'error',
        text: err.message || 'CSV export failed.'
      });
    } finally {
      setIsExportingCsv(false);
    }
  };

  const tabs: Array<{ key: AdminTabKey; label: string; count?: number }> = [
    { key: 'register', label: 'Master Register' },
    {
      key: 'restrictions',
      label: 'Restrictions',
      count: restrictedCount > 0 ? restrictedCount : undefined
    },
    { key: 'inventory', label: 'Catalog', count: inventory.length },
    {
      key: 'whitelist',
      label: 'Staff Whitelist',
      count: pendingRequests.length > 0 ? pendingRequests.length : undefined
    }
  ];

  return (
    <div className="max-w-7xl mx-auto px-4 py-6 space-y-5">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h1 className="text-lg font-semibold text-zinc-900 tracking-tight">
            SAC Governance Console
          </h1>
          <p className="text-xs text-zinc-500">
            {currentUser.name} ·{' '}
            <span className="font-mono">
              {isRootAdmin ? 'Primary Institutional Admin' : 'Delegated Admin'}
            </span>
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

      <AdminMetricsStrip
        todayCount={todayCount}
        totalCount={totalCount}
        restrictedCount={restrictedCount}
        pendingWhitelistCount={pendingRequests.length}
      />

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

      {/* Navigation Tabs */}
      <div className="border-b border-zinc-200 flex items-center gap-1 overflow-x-auto scrollbar-none">
        {tabs.map((tab) => {
          const isActive = activeTab === tab.key;
          return (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key)}
              className={`px-3.5 py-2 text-xs font-medium border-b-2 transition whitespace-nowrap inline-flex items-center gap-1.5 ${
                isActive
                  ? 'border-zinc-900 text-zinc-900'
                  : 'border-transparent text-zinc-500 hover:text-zinc-800'
              }`}
            >
              <span>{tab.label}</span>
              {tab.count !== undefined && (
                <span
                  className={`px-1.5 py-0.2 rounded text-[10px] font-mono tabular-nums ${
                    isActive
                      ? 'bg-zinc-900 text-white'
                      : 'bg-zinc-100 text-zinc-600 border border-zinc-200'
                  }`}
                >
                  {tab.count}
                </span>
              )}
            </button>
          );
        })}
      </div>

      {/* Active Tab View */}
      {activeTab === 'register' && (
        <MasterRegisterTab
          logs={registerLogs}
          statusFilter={statusFilter}
          onStatusFilterChange={(next) => {
            setStatusFilter(next);
            setCurrentPage(1);
          }}
          searchQuery={searchQuery}
          onSearchQueryChange={setSearchQuery}
          currentPage={currentPage}
          totalPages={totalPages}
          totalCount={totalCount}
          onPageChange={(nextPage) => loadData(nextPage, statusFilter)}
          onExportCsv={handleExportCsv}
          isExportingCsv={isExportingCsv}
        />
      )}

      {activeTab === 'restrictions' && (
        <RestrictionsTab
          users={users}
          isLoading={isLoading}
          onClearDefaulter={async (userId) => {
            try {
              setActionMessage(null);
              await api.clearDefaulter(userId);
              setActionMessage({
                type: 'success',
                text: 'Student defaulter restriction cleared.'
              });
              await loadData(currentPage, statusFilter);
            } catch (err: any) {
              setActionMessage({
                type: 'error',
                text: err.message || 'Failed to clear defaulter.'
              });
            }
          }}
          onResetCooldown={async (userId) => {
            try {
              setActionMessage(null);
              await api.resetCooldown(userId);
              setActionMessage({
                type: 'success',
                text: 'Student timeout cooldown reset.'
              });
              await loadData(currentPage, statusFilter);
            } catch (err: any) {
              setActionMessage({
                type: 'error',
                text: err.message || 'Failed to reset cooldown.'
              });
            }
          }}
        />
      )}

      {activeTab === 'inventory' && (
        <InventoryManagerTab
          inventory={inventory}
          onAddNewItem={async (payload) => {
            try {
              setActionMessage(null);
              await api.upsertInventory(payload);
              setActionMessage({
                type: 'success',
                text: `"${payload.name}" added to SAC catalog.`
              });
              await loadData(currentPage, statusFilter);
            } catch (err: any) {
              setActionMessage({
                type: 'error',
                text: err.message || 'Failed to add item.'
              });
            }
          }}
          onAdjustStock={async (item, delta) => {
            try {
              setActionMessage(null);
              const damaged = item.damagedQty ?? 0;
              const newAvailable = Math.max(0, item.availableQty + delta);
              const newTotal = Math.max(newAvailable + damaged, item.totalQty + delta);
              await api.upsertInventory({
                id: item.id,
                name: item.name,
                category: item.category,
                itemType: item.itemType,
                totalQty: newTotal,
                availableQty: newAvailable,
                damagedQty: damaged
              });
              await loadData(currentPage, statusFilter);
            } catch (err: any) {
              setActionMessage({
                type: 'error',
                text: err.message || 'Failed to adjust stock.'
              });
            }
          }}
          onDeleteItem={async (itemId) => {
            try {
              setActionMessage(null);
              await api.deleteInventory(itemId);
              setActionMessage({
                type: 'success',
                text: 'Item removed from catalog.'
              });
              await loadData(currentPage, statusFilter);
            } catch (err: any) {
              setActionMessage({
                type: 'error',
                text: err.message || 'Failed to delete item.'
              });
              throw err;
            }
          }}
        />
      )}

      {activeTab === 'whitelist' && (
        <StaffWhitelistTab
          currentUser={currentUser}
          isRootAdmin={isRootAdmin}
          initialAdminEmail={initialAdminEmail}
          pendingRequests={pendingRequests}
          activeUsers={activeWhitelistedUsers}
          actionLoadingId={whitelistActionLoading}
          onApproveRequest={async (requestId, role) => {
            try {
              setWhitelistActionLoading(requestId);
              setActionMessage(null);
              await api.approveWhitelist(requestId, role);
              setActionMessage({
                type: 'success',
                text: `External request approved with ${role} role.`
              });
              await loadData(currentPage, statusFilter);
            } catch (err: any) {
              setActionMessage({
                type: 'error',
                text: err.message || 'Failed to approve whitelist request.'
              });
            } finally {
              setWhitelistActionLoading(null);
            }
          }}
          onRejectRequest={async (requestId) => {
            try {
              setWhitelistActionLoading(requestId);
              setActionMessage(null);
              await api.rejectWhitelist(requestId);
              setActionMessage({
                type: 'success',
                text: 'Whitelist request rejected.'
              });
              await loadData(currentPage, statusFilter);
            } catch (err: any) {
              setActionMessage({
                type: 'error',
                text: err.message || 'Failed to reject whitelist request.'
              });
            } finally {
              setWhitelistActionLoading(null);
            }
          }}
          onDirectAdd={async (payload) => {
            try {
              setActionMessage(null);
              await api.directAddWhitelist(payload);
              setActionMessage({
                type: 'success',
                text: `Authorized ${payload.email} as ${payload.role}.`
              });
              await loadData(currentPage, statusFilter);
            } catch (err: any) {
              setActionMessage({
                type: 'error',
                text: err.message || 'Failed to authorize external account.'
              });
            }
          }}
          onRevokeAccess={async (staffId) => {
            try {
              setWhitelistActionLoading(staffId);
              setActionMessage(null);
              await api.revokeWhitelist(staffId);
              setActionMessage({
                type: 'success',
                text: 'External account access revoked.'
              });
              await loadData(currentPage, statusFilter);
            } catch (err: any) {
              setActionMessage({
                type: 'error',
                text: err.message || 'Failed to revoke access.'
              });
            } finally {
              setWhitelistActionLoading(null);
            }
          }}
        />
      )}
    </div>
  );
};
