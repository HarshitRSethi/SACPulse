import React, { useState } from 'react';
import type { User } from '../types/index';
import { Check, Loader2, Terminal, X } from 'lucide-react';

export interface DevUserPreset {
  id?: string;
  name: string;
  email: string;
  role: 'STUDENT' | 'GUARD' | 'ADMIN';
  rollNo?: string;
  code: string;
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
    code: 'S1',
    label: 'Student A',
    badge: 'IIT2023001'
  },
  {
    id: '15661c05-f5bb-413a-81db-6038ac42ff41',
    name: 'Student B',
    email: 'studentb@iiita.ac.in',
    role: 'STUDENT',
    rollNo: 'IIT2023002',
    code: 'S2',
    label: 'Student B',
    badge: 'IIT2023002'
  },
  {
    id: '4088da13-39c6-4257-9880-6f17e55fec2b',
    name: 'SAC Guard Ramesh',
    email: 'guard.sac.iiita@gmail.com',
    role: 'GUARD',
    code: 'GD',
    label: 'Guard Desk',
    badge: 'Counter'
  },
  {
    id: '1f1e9350-4a2e-40da-a076-799e8df1d422',
    name: 'SAC Admin Dr. Sharma',
    email: 'admin@iiita.ac.in',
    role: 'ADMIN',
    code: 'AD',
    label: 'SAC Admin',
    badge: 'Governance'
  }
];

interface DevRoleSwitcherProps {
  isVisible: boolean;
  onDismissMode: () => void;
  currentUser: User | null;
  onSelectUser: (preset: DevUserPreset) => void;
  isSwitching?: boolean;
}

export const DevRoleSwitcher: React.FC<DevRoleSwitcherProps> = ({
  isVisible,
  onDismissMode,
  currentUser,
  onSelectUser,
  isSwitching = false
}) => {
  const [isOpen, setIsOpen] = useState(false);

  if (!isVisible) {
    return null;
  }

  const activePreset = PRESET_USERS.find(
    (p) =>
      p.email.toLowerCase() === currentUser?.email?.toLowerCase() ||
      p.id === currentUser?.id
  );

  return (
    <aside
      aria-label="Evaluation Role Switcher"
      className="fixed bottom-4 right-4 z-50 flex flex-col items-end"
    >
      {isOpen && (
        <div className="mb-2 w-80 bg-white rounded-lg border border-zinc-200 shadow-lg p-3.5">
          <div className="flex items-center justify-between pb-2.5 border-b border-zinc-100">
            <div>
              <h3 className="font-semibold text-xs text-zinc-900">
                Demo Session Switcher
              </h3>
              <span className="text-[11px] text-zinc-500">
                Toggle with <kbd className="font-mono text-[10px] px-1 py-0.5 bg-zinc-100 border border-zinc-200 rounded">Ctrl+Shift+D</kbd>
              </span>
            </div>
            <div className="flex items-center gap-1">
              <button
                onClick={onDismissMode}
                className="px-2 py-1 rounded text-[10px] font-medium text-zinc-500 hover:text-zinc-800 hover:bg-zinc-100 transition"
                title="Hide demo switcher (Ctrl+Shift+D to reopen)"
              >
                Hide
              </button>
              <button
                onClick={() => setIsOpen(false)}
                className="p-1 rounded hover:bg-zinc-100 text-zinc-400 hover:text-zinc-700 transition"
                title="Collapse"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>

          <div className="mt-2.5 space-y-1.5">
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
                  className={`w-full flex items-center justify-between px-2.5 py-2 rounded-md text-left border transition ${
                    isActive
                      ? 'bg-zinc-900 text-white border-zinc-900'
                      : 'bg-white hover:bg-zinc-50 text-zinc-800 border-zinc-200'
                  }`}
                >
                  <div className="flex items-center gap-2.5 min-w-0">
                    <span
                      className={`w-6 h-6 rounded text-[10px] font-mono font-semibold flex items-center justify-center shrink-0 ${
                        isActive
                          ? 'bg-zinc-800 text-zinc-200'
                          : 'bg-zinc-100 text-zinc-700 border border-zinc-200'
                      }`}
                    >
                      {preset.code}
                    </span>
                    <div className="min-w-0">
                      <div className="flex items-center gap-1.5">
                        <span className="font-medium text-xs truncate">{preset.label}</span>
                        <span
                          className={`text-[10px] font-mono px-1.5 py-0.2 rounded ${
                            isActive ? 'bg-zinc-800 text-zinc-300' : 'bg-zinc-100 text-zinc-600'
                          }`}
                        >
                          {preset.badge}
                        </span>
                      </div>
                      <span
                        className={`text-[10px] font-mono block truncate ${
                          isActive ? 'text-zinc-400' : 'text-zinc-500'
                        }`}
                      >
                        {preset.email}
                      </span>
                    </div>
                  </div>

                  {isActive && <Check className="w-3.5 h-3.5 text-emerald-400 shrink-0" />}
                </button>
              );
            })}
          </div>
        </div>
      )}

      <button
        onClick={() => setIsOpen(!isOpen)}
        disabled={isSwitching}
        className="flex items-center gap-2 px-3 py-1.5 rounded-md bg-zinc-900 hover:bg-zinc-800 text-white border border-zinc-800 shadow-md text-xs font-medium transition"
        title="Demo Session Switcher (Ctrl+Shift+D)"
      >
        {isSwitching ? (
          <Loader2 className="w-3.5 h-3.5 animate-spin text-zinc-300" />
        ) : (
          <Terminal className="w-3.5 h-3.5 text-zinc-400" />
        )}
        <span>Demo Role</span>
        {activePreset && (
          <span className="px-1.5 py-0.5 rounded bg-zinc-800 text-[10px] font-mono text-zinc-300">
            {activePreset.code}
          </span>
        )}
      </button>
    </aside>
  );
};
