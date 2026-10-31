import React, { useState } from 'react';
import type { User } from '../types/index';
import { Wrench, X, Check, Loader2 } from 'lucide-react';

export interface DevUserPreset {
  id?: string;
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
    email: 'guard.sac.iiita@gmail.com',
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
  isSwitching?: boolean;
}

export const DevRoleSwitcher: React.FC<DevRoleSwitcherProps> = ({
  currentUser,
  onSelectUser,
  isSwitching = false
}) => {
  const [isOpen, setIsOpen] = useState(false);

  const activePreset = PRESET_USERS.find(
    (p) =>
      p.email.toLowerCase() === currentUser?.email?.toLowerCase() ||
      p.id === currentUser?.id
  );

  return (
    <aside aria-label="Developer Role Switcher" className="fixed bottom-5 right-5 z-50 flex flex-col items-end">
      {/* Expanded Floating Card */}
      {isOpen && (
        <div className="mb-3 w-80 sm:w-96 bg-white/95 backdrop-blur-md rounded-3xl border border-zinc-200/90 shadow-2xl p-5 animate-in slide-in-from-bottom-2 duration-150">
          <div className="flex items-center justify-between pb-3 border-b border-zinc-100">
            <div className="flex items-center gap-2">
              <span className="p-1.5 rounded-xl bg-zinc-100 text-zinc-800 text-sm">
                🛠️
              </span>
              <div>
                <h3 className="font-extrabold text-xs text-zinc-900 tracking-tight">
                  Dev Role Switcher
                </h3>
                <span className="text-[10px] text-zinc-400 font-mono">
                  Multi-account testing dock
                </span>
              </div>
            </div>
            <button
              onClick={() => setIsOpen(false)}
              className="p-1 rounded-xl hover:bg-zinc-100 text-zinc-400 hover:text-zinc-700 transition"
              title="Close Dock"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          <p className="text-[11px] text-zinc-500 my-3 leading-relaxed">
            Instantly switch authenticated sessions to verify student requests, guard counter returns, or admin governance:
          </p>

          <div className="space-y-2">
            {PRESET_USERS.map((preset) => {
              const isActive =
                preset.email.toLowerCase() === currentUser?.email?.toLowerCase() ||
                preset.id === currentUser?.id;

              return (
                <button
                  key={preset.email}
                  disabled={isSwitching}
                  onClick={() => {
                    onSelectUser(preset);
                    setIsOpen(false);
                  }}
                  className={`w-full flex items-center justify-between p-2.5 rounded-2xl text-left border transition-all ${
                    isActive
                      ? 'bg-zinc-900 text-white border-zinc-900 shadow-sm'
                      : 'bg-zinc-50 hover:bg-zinc-100 text-zinc-800 border-zinc-200/80 hover:border-zinc-300'
                  }`}
                >
                  <div className="flex items-center gap-2.5">
                    <span className="text-lg">{preset.avatar}</span>
                    <div>
                      <div className="flex items-center gap-1.5">
                        <span className="font-bold text-xs">{preset.label}</span>
                        <span
                          className={`text-[9px] font-mono px-1.5 py-0.5 rounded ${
                            isActive
                              ? 'bg-zinc-800 text-zinc-200'
                              : 'bg-zinc-200/80 text-zinc-600'
                          }`}
                        >
                          {preset.badge}
                        </span>
                      </div>
                      <span
                        className={`text-[10px] font-mono block ${
                          isActive ? 'text-zinc-300' : 'text-zinc-500'
                        }`}
                      >
                        {preset.email}
                      </span>
                    </div>
                  </div>

                  {isActive && (
                    <span className="flex items-center gap-1 text-[10px] font-mono font-bold text-emerald-400 bg-emerald-950/40 px-2 py-0.5 rounded-full border border-emerald-500/30">
                      <Check className="w-3 h-3" /> Active
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* Collapsed Subtle Floating Pill */}
      <button
        onClick={() => setIsOpen(!isOpen)}
        disabled={isSwitching}
        className="group relative flex items-center gap-2 px-3.5 py-2.5 rounded-full bg-zinc-900/90 hover:bg-zinc-950 text-white border border-zinc-800 shadow-xl backdrop-blur-md text-xs font-semibold transition-all hover:scale-105 active:scale-95"
        title="Toggle Developer Account Switcher"
      >
        {isSwitching ? (
          <Loader2 className="w-3.5 h-3.5 animate-spin text-blue-400" />
        ) : (
          <Wrench className="w-3.5 h-3.5 text-zinc-400 group-hover:text-amber-400 transition" />
        )}
        <span>Dev Switcher</span>

        {activePreset && (
          <span className="flex items-center gap-1 px-2 py-0.5 rounded-full bg-zinc-800 text-[10px] font-mono text-zinc-300 border border-zinc-700">
            <span>{activePreset.avatar}</span>
            <span className="hidden sm:inline">{activePreset.label}</span>
          </span>
        )}
      </button>
    </aside>
  );
};
