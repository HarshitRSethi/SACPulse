import React from 'react';
import type { User } from '../types/index';
import { UserCheck, Shield, Award, Wifi, WifiOff } from 'lucide-react';

export interface DevUserPreset {
  id: string;
  name: string;
  email: string;
  role: 'STUDENT' | 'GUARD' | 'ADMIN';
  rollNo?: string;
  avatar: string;
  label: string;
  badge: string;
}

export const PRESET_USERS: DevUserPreset[] = [
  {
    id: '0369ef9a-838b-4690-bf2c-6c8f0ba75576',
    name: 'Student A',
    email: 'studenta@iiita.ac.in',
    role: 'STUDENT',
    rollNo: 'IIT2023001',
    avatar: '👨‍🎓',
    label: 'Student A',
    badge: 'IIT2023001'
  },
  {
    id: '15661c05-f5bb-413a-81db-6038ac42ff41',
    name: 'Student B',
    email: 'studentb@iiita.ac.in',
    role: 'STUDENT',
    rollNo: 'IIT2023002',
    avatar: '👩‍🎓',
    label: 'Student B',
    badge: 'IIT2023002'
  },
  {
    id: '4088da13-39c6-4257-9880-6f17e55fec2b',
    name: 'SAC Guard Ramesh',
    email: 'guard@iiita.ac.in',
    role: 'GUARD',
    avatar: '👮‍♂️',
    label: 'SAC Guard',
    badge: 'Desk Operator'
  },
  {
    id: '1f1e9350-4a2e-40da-a076-799e8df1d422',
    name: 'SAC Admin Dr. Sharma',
    email: 'admin@iiita.ac.in',
    role: 'ADMIN',
    avatar: '🏛️',
    label: 'SAC Admin',
    badge: 'Governance'
  }
];

interface DevRoleSwitcherProps {
  currentUser: User | null;
  onSelectUser: (preset: DevUserPreset) => void;
  isSocketConnected: boolean;
}

export const DevRoleSwitcher: React.FC<DevRoleSwitcherProps> = ({
  currentUser,
  onSelectUser,
  isSocketConnected
}) => {
  return (
    <header className="sticky top-0 z-50 bg-white/95 backdrop-blur-md border-b border-[#E4E4E7] px-4 py-2.5 shadow-sm">
      <div className="max-w-7xl mx-auto flex flex-wrap items-center justify-between gap-3">
        {/* Branding & Socket Live Indicator */}
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2">
            <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-blue-600 font-black text-white text-sm shadow-sm shadow-blue-500/20">
              ⚡
            </span>
            <div>
              <span className="text-base font-extrabold tracking-tight text-zinc-900 flex items-center gap-1.5">
                SACPulse
                <span className="text-[10px] uppercase font-mono font-bold px-1.5 py-0.5 rounded bg-blue-50 text-blue-700 border border-blue-200">
                  IIITA
                </span>
              </span>
            </div>
          </div>

          <div
            className={`hidden sm:inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-semibold transition-all ${
              isSocketConnected
                ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                : 'bg-amber-50 text-amber-700 border border-amber-200'
            }`}
            title={isSocketConnected ? 'Real-Time WebSocket Sync Connected' : 'Reconnecting to Real-Time Hub...'}
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

        {/* Dev Role Quick-Switcher Pills */}
        <div className="flex items-center gap-1.5 overflow-x-auto pb-1 sm:pb-0 scrollbar-none">
          <span className="text-[11px] uppercase tracking-wider text-zinc-400 font-bold mr-1 hidden md:inline">
            Role Switcher:
          </span>
          {PRESET_USERS.map((preset) => {
            const isActive = currentUser?.id === preset.id;
            return (
              <button
                key={preset.id}
                onClick={() => onSelectUser(preset)}
                className={`relative group flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all duration-150 ${
                  isActive
                    ? 'bg-zinc-900 text-white shadow-sm ring-1 ring-zinc-800'
                    : 'bg-zinc-100 hover:bg-zinc-200/80 text-zinc-700 border border-zinc-200'
                }`}
              >
                <span className="text-sm">{preset.avatar}</span>
                <span className="whitespace-nowrap">{preset.label}</span>
                <span
                  className={`text-[10px] px-1 rounded font-mono ${
                    isActive
                      ? 'bg-white/20 text-white'
                      : 'bg-zinc-200 text-zinc-600'
                  }`}
                >
                  {preset.badge}
                </span>
              </button>
            );
          })}
        </div>

        {/* Active User Pill */}
        {currentUser && (
          <div className="hidden lg:flex items-center gap-2 pl-3 border-l border-zinc-200 text-xs">
            <div className="flex flex-col text-right">
              <span className="font-bold text-zinc-900">{currentUser.name}</span>
              <span className="text-[11px] text-zinc-500 font-mono">
                {currentUser.rollNo || currentUser.role}
              </span>
            </div>
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
        )}
      </div>
    </header>
  );
};
