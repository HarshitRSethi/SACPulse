import { useState, useEffect, useCallback } from 'react';
import type { StudentRealtimeNotification, User } from './types/index';
import { api } from './services/api';
import { socketService } from './services/socket';
import { BrandMark } from './components/BrandMark';
import { DevRoleSwitcher, type DevUserPreset } from './components/DevRoleSwitcher';
import { LoginPage } from './components/auth/LoginPage';
import { MobileSetupModal } from './components/auth/MobileSetupModal';
import { StudentDashboard } from './components/student/StudentDashboard';
import { GuardDashboard } from './components/guard/GuardDashboard';
import { AdminDashboard } from './components/admin/AdminDashboard';
import { AlertTriangle, Bell, LogOut, X } from 'lucide-react';

const DEMO_MODE_STORAGE_KEY = 'sacpulse_demo_switcher_visible';

function resolveInitialDemoVisibility(): boolean {
  try {
    const params = new URLSearchParams(window.location.search);
    if (params.get('demo') === '1') {
      sessionStorage.setItem(DEMO_MODE_STORAGE_KEY, '1');
      return true;
    }
    return sessionStorage.getItem(DEMO_MODE_STORAGE_KEY) === '1';
  } catch {
    return false;
  }
}

export default function App() {
  const [currentUser, setCurrentUser] = useState<User | null>(() => api.getStoredUser());
  const [sessionToken, setSessionToken] = useState<string | null>(() =>
    api.getStoredToken()
  );
  const [isSocketConnected, setIsSocketConnected] = useState<boolean>(false);
  const [isSwitchingDev, setIsSwitchingDev] = useState<boolean>(false);
  const [demoModeVisible, setDemoModeVisible] = useState<boolean>(() =>
    resolveInitialDemoVisibility()
  );
  const [toastNotification, setToastNotification] = useState<string | null>(null);

  const handleSignOut = useCallback(() => {
    api.clearStoredAuth();
    setCurrentUser(null);
    setSessionToken(null);
  }, []);

  // Automatically clear stale/unsigned sessions when backend returns 401
  useEffect(() => {
    api.onUnauthorized(() => {
      setCurrentUser(null);
      setSessionToken(null);
    });
    return () => api.onUnauthorized(null);
  }, []);

  // Discrete keyboard shortcut: Ctrl+Shift+D (or Cmd+Shift+D) toggles Demo Role Switcher
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key.toLowerCase() === 'd') {
        e.preventDefault();
        setDemoModeVisible((prev) => {
          const next = !prev;
          try {
            if (next) {
              sessionStorage.setItem(DEMO_MODE_STORAGE_KEY, '1');
            } else {
              sessionStorage.removeItem(DEMO_MODE_STORAGE_KEY);
            }
          } catch {
            // ignore storage errors
          }
          return next;
        });
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);

  // Initialize the Socket.io connection, authenticated with the current session JWT.
  // The server assigns rooms from the verified token, so whenever the session changes
  // (login, logout, demo role switch, 401) the socket reconnects with the new token.
  useEffect(() => {
    const socket = socketService.connect(sessionToken);

    const handleConnect = () => setIsSocketConnected(true);
    const handleDisconnect = () => setIsSocketConnected(false);

    if (socket.connected) handleConnect();

    socket.on('connect', handleConnect);
    socket.on('disconnect', handleDisconnect);

    return () => {
      socket.off('connect', handleConnect);
      socket.off('disconnect', handleDisconnect);
    };
  }, [sessionToken]);

  const refreshCurrentUser = useCallback(async () => {
    if (!currentUser) return;
    try {
      const updated = await api.getUser(currentUser.id);
      setCurrentUser(updated);
      const token = api.getStoredToken();
      if (token) {
        api.setStoredAuth(token, updated);
      }
    } catch {
      // Handled by api.onUnauthorized if 401
    }
  }, [currentUser]);

  useEffect(() => {
    if (!currentUser || currentUser.role !== 'STUDENT') return;
    const socket = socketService.connect();

    const handleStudentNotification = (payload: StudentRealtimeNotification) => {
      if (payload.studentId && payload.studentId !== currentUser.id) return;
      const msg =
        (payload.data?.message as string) ||
        (payload.data?.reason as string) ||
        null;
      if (msg) {
        setToastNotification(msg);
      }
      if (
        payload.event === 'DEFAULTER_LOCKED' ||
        payload.event === 'PENALTY_APPLIED' ||
        payload.event === 'RESTRICTION_CLEARED'
      ) {
        refreshCurrentUser();
      }
    };

    socket.on('student:notification', handleStudentNotification);
    return () => {
      socket.off('student:notification', handleStudentNotification);
    };
  }, [currentUser, refreshCurrentUser]);

  useEffect(() => {
    if (!toastNotification) return;
    const t = setTimeout(() => setToastNotification(null), 5000);
    return () => clearTimeout(t);
  }, [toastNotification]);

  // Sync latest user profile on mount if a valid signed JWT is stored
  useEffect(() => {
    const stored = api.getStoredUser();
    const token = api.getStoredToken();
    if (stored?.id && token) {
      api
        .getUser(stored.id)
        .then((latestUser) => {
          setCurrentUser(latestUser);
          api.setStoredAuth(token, latestUser);
        })
        .catch(() => {
          // 401 handler clears stale unsigned tokens cleanly
        });
    } else if (stored && !token) {
      handleSignOut();
    }
  }, [handleSignOut]);

  const handleLoginSuccess = (
    user: User,
    token: string,
    requiresMobileSetup: boolean
  ) => {
    const enrichedUser: User = { ...user, requiresMobileSetup };
    setCurrentUser(enrichedUser);
    setSessionToken(token);
    api.setStoredAuth(token, enrichedUser);
  };

  const handleMobileSetupSuccess = (updatedUser: User) => {
    const enriched: User = { ...updatedUser, requiresMobileSetup: false };
    setCurrentUser(enriched);
    const token = sessionToken || api.getStoredToken() || '';
    if (token) {
      api.setStoredAuth(token, enriched);
    }
  };

  const handleSelectDevPreset = async (preset: DevUserPreset) => {
    try {
      setIsSwitchingDev(true);
      const res = await api.loginDemoSession(preset.email, preset.name);
      handleLoginSuccess(res.user, res.token, res.requiresMobileSetup);
    } catch (err: any) {
      setToastNotification(err.message || 'Demo role switch failed.');
    } finally {
      setIsSwitchingDev(false);
    }
  };

  const handleDismissDemoMode = () => {
    setDemoModeVisible(false);
    try {
      sessionStorage.removeItem(DEMO_MODE_STORAGE_KEY);
    } catch {
      // ignore
    }
  };

  if (!currentUser) {
    return (
      <div className="relative">
        <LoginPage
          onLoginSuccess={handleLoginSuccess}
          demoModeEnabled={demoModeVisible}
          onSelectDemoPreset={handleSelectDevPreset}
          isSwitchingDemo={isSwitchingDev}
        />
        <DevRoleSwitcher
          isVisible={demoModeVisible}
          onDismissMode={handleDismissDemoMode}
          currentUser={null}
          onSelectUser={handleSelectDevPreset}
          isSwitching={isSwitchingDev}
        />
      </div>
    );
  }

  const isUserBlocked =
    currentUser.isDefaulter ||
    Boolean(
      currentUser.penaltyUntil && new Date(currentUser.penaltyUntil) > new Date()
    );

  const showMobileSetupModal =
    currentUser.requiresMobileSetup ||
    currentUser.mobileNo === null ||
    currentUser.mobileNo === undefined ||
    currentUser.mobileNo === '';

  const roleLabel =
    currentUser.role === 'ADMIN'
      ? 'Admin'
      : currentUser.role === 'GUARD'
        ? 'Guard Desk'
        : currentUser.rollNo || 'Student';

  return (
    <div className="min-h-screen bg-[#FAFAFB] text-zinc-900 font-sans flex flex-col">
      {showMobileSetupModal && (
        <MobileSetupModal
          user={currentUser}
          token={sessionToken}
          onSuccess={handleMobileSetupSuccess}
        />
      )}

      {/* Real-time Toast Notification */}
      {toastNotification && (
        <div className="fixed top-16 right-4 z-50 max-w-sm bg-zinc-900 text-white rounded-lg border border-zinc-800 shadow-lg px-3.5 py-2.5 text-xs flex items-start gap-2.5">
          <Bell className="w-3.5 h-3.5 text-zinc-300 shrink-0 mt-0.5" />
          <span className="flex-1 leading-relaxed">{toastNotification}</span>
          <button
            onClick={() => setToastNotification(null)}
            className="text-zinc-400 hover:text-white transition"
            aria-label="Dismiss notification"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {/* Clean Restrained Top Header */}
      <header className="sticky top-0 z-30 bg-white border-b border-zinc-200 px-4 h-13 flex items-center">
        <div className="max-w-7xl w-full mx-auto flex items-center justify-between gap-3 py-2.5">
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-2">
              <BrandMark size="sm" />
              <span className="text-sm font-semibold tracking-tight text-zinc-900">
                SACPulse
              </span>
              <span className="text-[10px] font-mono uppercase px-1.5 py-0.5 rounded bg-zinc-100 text-zinc-600 border border-zinc-200">
                IIITA
              </span>
            </div>

            <div
              className="hidden sm:inline-flex items-center gap-1.5 text-[11px] text-zinc-500 border-l border-zinc-200 pl-3"
              title={
                isSocketConnected
                  ? 'Real-time WebSocket connected'
                  : 'Reconnecting to real-time server'
              }
            >
              <span
                className={`h-1.5 w-1.5 rounded-full ${
                  isSocketConnected ? 'bg-emerald-500' : 'bg-amber-500'
                }`}
              />
              <span>{isSocketConnected ? 'Live' : 'Connecting'}</span>
            </div>
          </div>

          <div className="flex items-center gap-2.5">
            {isUserBlocked && (
              <div className="hidden md:inline-flex items-center gap-1.5 px-2 py-1 rounded-md bg-red-50 border border-red-200 text-red-700 text-[11px] font-medium">
                <AlertTriangle className="w-3 h-3" />
                <span>Restricted</span>
              </div>
            )}

            <div className="flex items-center gap-2 px-2.5 py-1 rounded-md bg-zinc-50 border border-zinc-200 text-xs">
              <span className="font-medium text-zinc-900 max-w-[140px] sm:max-w-[200px] truncate">
                {currentUser.name}
              </span>
              <span className="text-zinc-300">·</span>
              <span className="text-[11px] text-zinc-500 font-mono">{roleLabel}</span>
            </div>

            <button
              onClick={handleSignOut}
              className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md border border-zinc-200 hover:bg-zinc-50 text-zinc-600 hover:text-zinc-900 text-xs font-medium transition"
              title="Sign out"
            >
              <LogOut className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Sign out</span>
            </button>
          </div>
        </div>
      </header>

      {/* Role-Routed Workspace */}
      <main className="flex-1">
        {currentUser.role === 'STUDENT' && (
          <StudentDashboard
            key={currentUser.id}
            currentUser={currentUser}
            onRefreshUser={refreshCurrentUser}
          />
        )}

        {currentUser.role === 'GUARD' && (
          <GuardDashboard key={currentUser.id} currentUser={currentUser} />
        )}

        {currentUser.role === 'ADMIN' && (
          <AdminDashboard key={currentUser.id} currentUser={currentUser} />
        )}
      </main>

      <DevRoleSwitcher
        isVisible={demoModeVisible}
        onDismissMode={handleDismissDemoMode}
        currentUser={currentUser}
        onSelectUser={handleSelectDevPreset}
        isSwitching={isSwitchingDev}
      />

      <footer className="border-t border-zinc-200 bg-white py-3.5 px-6 text-center text-[11px] text-zinc-500">
        IIITA Student Activity Centre — Digital Equipment & Room Register
      </footer>
    </div>
  );
}
