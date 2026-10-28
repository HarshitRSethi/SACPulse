import { useState, useEffect } from 'react';
import type { User } from './types/index';
import { api } from './services/api';
import { socketService } from './services/socket';
import { DevRoleSwitcher, PRESET_USERS, type DevUserPreset } from './components/DevRoleSwitcher';
import { StudentDashboard } from './components/student/StudentDashboard';
import { GuardDashboard } from './components/guard/GuardDashboard';
import { AdminDashboard } from './components/admin/AdminDashboard';
import { Loader2 } from 'lucide-react';

export default function App() {
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [isSocketConnected, setIsSocketConnected] = useState<boolean>(false);
  const [isUserLoading, setIsUserLoading] = useState<boolean>(true);

  // Initialize socket and load default user (Student A)
  useEffect(() => {
    const socket = socketService.connect();

    const handleConnect = () => setIsSocketConnected(true);
    const handleDisconnect = () => setIsSocketConnected(false);

    if (socket.connected) {
      setIsSocketConnected(true);
    }

    socket.on('connect', handleConnect);
    socket.on('disconnect', handleDisconnect);

    // Initial load: Default to Student A
    selectPresetUser(PRESET_USERS[0]);

    return () => {
      socket.off('connect', handleConnect);
      socket.off('disconnect', handleDisconnect);
    };
  }, []);

  const selectPresetUser = async (preset: DevUserPreset) => {
    try {
      setIsUserLoading(true);
      const user = await api.getUser(preset.id);
      setCurrentUser(user);
    } catch (err) {
      console.error('Failed to fetch user:', err);
      // Fallback local preset user if network error
      setCurrentUser({
        id: preset.id,
        name: preset.name,
        email: preset.email,
        role: preset.role,
        rollNo: preset.rollNo
      });
    } finally {
      setIsUserLoading(false);
    }
  };

  const refreshCurrentUser = async () => {
    if (!currentUser) return;
    try {
      const updated = await api.getUser(currentUser.id);
      setCurrentUser(updated);
    } catch (err) {
      console.warn('Failed to refresh user:', err);
    }
  };

  return (
    <div className="min-h-screen bg-[#FAFAFB] text-zinc-900 selection:bg-blue-600 selection:text-white font-sans flex flex-col">
      {/* Dev Role Switcher Header */}
      <DevRoleSwitcher
        currentUser={currentUser}
        onSelectUser={selectPresetUser}
        isSocketConnected={isSocketConnected}
      />

      {/* Main Content Area */}
      <main className="flex-1">
        {isUserLoading && !currentUser ? (
          <div className="flex flex-col items-center justify-center min-h-[60vh] gap-3 text-zinc-500">
            <Loader2 className="w-8 h-8 animate-spin text-blue-600" />
            <p className="text-xs font-semibold uppercase tracking-wider text-zinc-500">
              Connecting to SACPulse...
            </p>
          </div>
        ) : (
          <>
            {currentUser?.role === 'STUDENT' && (
              <StudentDashboard
                key={currentUser.id}
                currentUser={currentUser}
                onRefreshUser={refreshCurrentUser}
              />
            )}

            {currentUser?.role === 'GUARD' && (
              <GuardDashboard
                key={currentUser.id}
                currentUser={currentUser}
              />
            )}

            {currentUser?.role === 'ADMIN' && (
              <AdminDashboard
                key={currentUser.id}
                currentUser={currentUser}
              />
            )}
          </>
        )}
      </main>

      {/* Footer */}
      <footer className="border-t border-[#E4E4E7] bg-white py-4 px-6 text-center text-xs text-zinc-500">
        <p>
          IIITA Student Activity Centre (SAC) • Real-Time Digital Register & Equipment Pulse
        </p>
      </footer>
    </div>
  );
}
