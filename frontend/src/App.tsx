import { useState, useEffect, useCallback } from 'react';
import type { User } from './types/index';
import { api } from './services/api';
import { socketService } from './services/socket';
import { DevRoleSwitcher, type DevUserPreset } from './components/DevRoleSwitcher';
import { LoginPage } from './components/auth/LoginPage';
import { MobileSetupModal } from './components/auth/MobileSetupModal';
import { StudentDashboard } from './components/student/StudentDashboard';
import { GuardDashboard } from './components/guard/GuardDashboard';
import { AdminDashboard } from './components/admin/AdminDashboard';
import {
  Wifi,
  WifiOff,
  LogOut,
  UserCheck,
  Shield,
  Award,
  AlertTriangle
} from 'lucide-react';

export default function App() {
  const [currentUser, setCurrentUser] = useState<User | null>(() => api.getStoredUser());
  const [sessionToken, setSessionToken] = useState<string | null>(() => api.getStoredToken());
  const [isSocketConnected, setIsSocketConnected] = useState<boolean>(false);
  const [isSwitchingDev, setIsSwitchingDev] = useState<boolean>(false);

  // Initialize Socket connection
  useEffect(() => {
    const socket = socketService.connect();

    const handleConnect = () => setIsSocketConnected(true);
    const handleDisconnect = () => setIsSocketConnected(false);

    if (socket.connected) {
      setIsSocketConnected(true);
    }

    socket.on('connect', handleConnect);
    socket.on('disconnect', handleDisconnect);

    return () => {
      socket.off('connect', handleConnect);
      socket.off('disconnect', handleDisconnect);
    };
  }, []);

  // Sync latest user profile on mount if token is stored
  useEffect(() => {
    const stored = api.getStoredUser();
    if (stored?.id) {
      api.getUser(stored.id)
        .then((latestUser) => {
          setCurrentUser(latestUser);
          const token = api.getStoredToken();
          if (token) {
            api.setStoredAuth(token, latestUser);
          }
        })
        .catch((err) => {
          console.warn('Could not sync latest user profile from server:', err);
        });
    }
  }, []);

  const refreshCurrentUser = useCallback(async () => {
    if (!currentUser) return;
    try {
      const updated = await api.getUser(currentUser.id);
      setCurrentUser(updated);
      const token = api.getStoredToken();
      if (token) {
        api.setStoredAuth(token, updated);
      }
    } catch (err) {
      console.warn('Failed to refresh user:', err);
    }
  }, [currentUser]);

  const handleLoginSuccess = (user: User, token: string, requiresMobileSetup: boolean) => {
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

  const handleSignOut = () => {
    api.clearStoredAuth();
    setCurrentUser(null);
    setSessionToken(null);
  };

  const handleSelectDevPreset = async (preset: DevUserPreset) => {
    try {
      setIsSwitchingDev(true);
      const res = await api.loginWithGoogle(preset.email, preset.name);
      handleLoginSuccess(res.user, res.token, res.requiresMobileSetup);
    } catch (err) {
      console.error('Failed to switch dev user via auth API:', err);
      // Fallback local switch if network error
      const fallbackUser: User = {
        id: preset.id || 'dev-user',
        name: preset.name,
        email: preset.email,
        role: preset.role,
        rollNo: preset.rollNo || null,
        requiresMobileSetup: false
      };
      setCurrentUser(fallbackUser);
    } finally {
      setIsSwitchingDev(false);
    }
  };

  // If not logged in, render LoginPage
  if (!currentUser) {
    return (
      <div className="relative">
        <LoginPage onLoginSuccess={handleLoginSuccess} />
        {/* Dev dock remains accessible for quick testing */}
        <DevRoleSwitcher
          currentUser={null}
          onSelectUser={handleSelectDevPreset}
          isSwitching={isSwitchingDev}
        />
      </div>
    );
  }

  const isUserBlocked =
    currentUser.isDefaulter ||
    Boolean(currentUser.penaltyUntil && new Date(currentUser.penaltyUntil) > new Date());

  const showMobileSetupModal =
    currentUser.requiresMobileSetup ||
    currentUser.mobileNo === null ||
    currentUser.mobileNo === undefined ||
    currentUser.mobileNo === '';

  return (
    <div className="min-h-screen bg-[#FAFAFB] text-zinc-900 selection:bg-blue-600 selection:text-white font-sans flex flex-col">
      {/* First-Time Mobile Setup Modal */}
      {showMobileSetupModal && (
        <MobileSetupModal
          user={currentUser}
          token={sessionToken}
          onSuccess={handleMobileSetupSuccess}
        />
      )}

      {/* Production Top Navbar */}
      <header className="sticky top-0 z-30 bg-white/95 backdrop-blur-md border-b border-[#E4E4E7] px-4 py-2.5 shadow-xs">
        <div className="max-w-7xl mx-auto flex items-center justify-between gap-3">
          
          {/* SACPulse Brand & Live Sync Indicator */}
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-2">
              <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-blue-600 font-black text-white text-sm shadow-sm shadow-blue-500/20">
                ⚡
              </span>
              <div className="flex items-center gap-1.5">
                <span className="text-base font-extrabold tracking-tight text-zinc-900">
                  SACPulse
                </span>
                <span className="text-[10px] uppercase font-mono font-bold px-1.5 py-0.5 rounded bg-blue-50 text-blue-700 border border-blue-200">
                  IIITA
                </span>
              </div>
            </div>

            {/* Socket Live Sync Pill */}
            <div
              className={`hidden sm:inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-semibold transition-all ${
                isSocketConnected
                  ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                  : 'bg-amber-50 text-amber-700 border border-amber-200'
              }`}
              title={
                isSocketConnected
                  ? 'Real-Time WebSocket Sync Connected'
                  : 'Reconnecting to Real-Time Hub...'
              }
            >
              {isSocketConnected ? (
                <>
                  <span className="relative flex h-2 w-2">
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
                    <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500" />
                  </span>
                  <span className="flex items-center gap-1">
                    <Wifi className="w-3 h-3" /> Live Sync
                  </span>
                </>
              ) : (
                <>
                  <span className="h-2 w-2 rounded-full bg-amber-500 animate-pulse" />
                  <span className="flex items-center gap-1">
                    <WifiOff className="w-3 h-3" /> Connecting...
                  </span>
                </>
              )}
            </div>
          </div>

          {/* User Profile Chip & Sign Out Button */}
          <div className="flex items-center gap-2 sm:gap-3">
            {/* Status warning pill if defaulter/cooldown */}
            {isUserBlocked && (
              <div className="hidden md:flex items-center gap-1 px-2.5 py-1 rounded-full bg-red-50 border border-red-200 text-red-700 text-xs font-bold animate-pulse">
                <AlertTriangle className="w-3.5 h-3.5" />
                <span>Account Restricted</span>
              </div>
            )}

            {/* User Profile Chip */}
            <div className="flex items-center gap-2.5 px-3 py-1.5 rounded-2xl bg-zinc-50 border border-zinc-200/90 text-xs">
              <div className="w-7 h-7 rounded-xl flex items-center justify-center font-bold text-xs shrink-0 shadow-xs border bg-white">
                {currentUser.role === 'ADMIN' && (
                  <Award className="w-4 h-4 text-purple-600" />
                )}
                {currentUser.role === 'GUARD' && (
                  <Shield className="w-4 h-4 text-amber-600" />
                )}
                {currentUser.role === 'STUDENT' && (
                  <UserCheck className="w-4 h-4 text-blue-600" />
                )}
              </div>

              <div className="flex flex-col text-left leading-tight">
                <span className="font-bold text-zinc-900 max-w-[130px] sm:max-w-[180px] truncate">
                  {currentUser.name}
                </span>
                <span className="text-[10px] text-zinc-500 font-mono">
                  {currentUser.rollNo || (currentUser.role === 'GUARD' ? 'Guard Desk' : 'SAC Admin')}
                </span>
              </div>
            </div>

            {/* Sign Out Button */}
            <button
              onClick={handleSignOut}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-2xl border border-zinc-200 hover:border-red-200 hover:bg-red-50 text-zinc-600 hover:text-red-700 text-xs font-semibold transition active:scale-95 shadow-xs"
              title="Sign Out of SACPulse"
            >
              <LogOut className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Sign Out</span>
            </button>
          </div>

        </div>
      </header>

      {/* Main Role-Based Dashboard Portal */}
      <main className="flex-1">
        {currentUser.role === 'STUDENT' && (
          <StudentDashboard
            key={currentUser.id}
            currentUser={currentUser}
            onRefreshUser={refreshCurrentUser}
          />
        )}

        {currentUser.role === 'GUARD' && (
          <GuardDashboard
            key={currentUser.id}
            currentUser={currentUser}
          />
        )}

        {currentUser.role === 'ADMIN' && (
          <AdminDashboard
            key={currentUser.id}
            currentUser={currentUser}
          />
        )}
      </main>

      {/* Floating Collapsible Dev Dock */}
      <DevRoleSwitcher
        currentUser={currentUser}
        onSelectUser={handleSelectDevPreset}
        isSwitching={isSwitchingDev}
      />

      {/* Footer */}
      <footer className="border-t border-[#E4E4E7] bg-white py-4 px-6 text-center text-xs text-zinc-500">
        <p>
          IIITA Student Activity Centre (SAC) • Real-Time Digital Register & Equipment Pulse
        </p>
      </footer>
    </div>
  );
}
