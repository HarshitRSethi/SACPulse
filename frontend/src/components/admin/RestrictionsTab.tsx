import React from 'react';
import type { User } from '../../types/index';
import { Phone } from 'lucide-react';

interface RestrictionsTabProps {
  users: User[];
  onClearDefaulter: (userId: string) => void;
  onResetCooldown: (userId: string) => void;
  isLoading: boolean;
}

export const RestrictionsTab: React.FC<RestrictionsTabProps> = ({
  users,
  onClearDefaulter,
  onResetCooldown,
  isLoading
}) => {
  const now = Date.now();
  const defaulters = users.filter((u) => u.role === 'STUDENT' && u.isDefaulter);
  const cooldownUsers = users.filter(
    (u) =>
      u.role === 'STUDENT' &&
      u.penaltyUntil &&
      new Date(u.penaltyUntil).getTime() > now
  );

  const formatExpiry = (iso?: string | null) => {
    if (!iso) return '';
    const d = new Date(iso);
    if (isNaN(d.getTime())) return '';
    return d.toLocaleTimeString([], {
      hour: '2-digit',
      minute: '2-digit',
      hour12: true
    });
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
      {/* Defaulter Lockouts */}
      <section className="bg-white border border-zinc-200 rounded-lg overflow-hidden">
        <div className="px-4 py-2.5 bg-zinc-50/80 border-b border-zinc-200 flex items-center justify-between">
          <h3 className="text-xs font-semibold text-zinc-800">
            Damaged Item Defaulters ({defaulters.length})
          </h3>
          <span className="text-[11px] text-zinc-500">Manual clearance required</span>
        </div>

        {defaulters.length === 0 ? (
          <div className="p-8 text-center text-xs text-zinc-500">
            No students are currently flagged as defaulters.
          </div>
        ) : (
          <div className="divide-y divide-zinc-100">
            {defaulters.map((student) => (
              <div
                key={student.id}
                className="px-4 py-3 flex items-center justify-between gap-3"
              >
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-semibold text-zinc-900 truncate">
                      {student.name}
                    </span>
                    <span className="font-mono text-[11px] px-1.5 py-0.5 rounded bg-zinc-100 text-zinc-700 border border-zinc-200">
                      {student.rollNo}
                    </span>
                  </div>
                  <div className="flex items-center gap-2 text-[11px] text-zinc-500 mt-0.5">
                    <span>{student.email}</span>
                    {student.mobileNo && (
                      <a
                        href={`tel:${student.mobileNo}`}
                        className="inline-flex items-center gap-1 font-mono tabular-nums hover:text-zinc-900"
                      >
                        <Phone className="w-2.5 h-2.5" />
                        {student.mobileNo}
                      </a>
                    )}
                  </div>
                </div>

                <button
                  onClick={() => onClearDefaulter(student.id)}
                  disabled={isLoading}
                  className="px-3 py-1.5 rounded-md text-xs font-medium bg-zinc-900 hover:bg-zinc-800 text-white transition disabled:opacity-50 shrink-0"
                >
                  Clear Defaulter
                </button>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* 5-Hour Timeout Cooldowns */}
      <section className="bg-white border border-zinc-200 rounded-lg overflow-hidden">
        <div className="px-4 py-2.5 bg-zinc-50/80 border-b border-zinc-200 flex items-center justify-between">
          <h3 className="text-xs font-semibold text-zinc-800">
            Active 5-Hour Cooldowns ({cooldownUsers.length})
          </h3>
          <span className="text-[11px] text-zinc-500">&gt;3 expired requests / hr</span>
        </div>

        {cooldownUsers.length === 0 ? (
          <div className="p-8 text-center text-xs text-zinc-500">
            No students are currently under timeout cooldown.
          </div>
        ) : (
          <div className="divide-y divide-zinc-100">
            {cooldownUsers.map((student) => (
              <div
                key={student.id}
                className="px-4 py-3 flex items-center justify-between gap-3"
              >
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-semibold text-zinc-900 truncate">
                      {student.name}
                    </span>
                    <span className="font-mono text-[11px] px-1.5 py-0.5 rounded bg-zinc-100 text-zinc-700 border border-zinc-200">
                      {student.rollNo}
                    </span>
                  </div>
                  <span className="text-[11px] text-amber-800 tabular-nums block mt-0.5">
                    Locked until {formatExpiry(student.penaltyUntil)}
                  </span>
                </div>

                <button
                  onClick={() => onResetCooldown(student.id)}
                  disabled={isLoading}
                  className="px-3 py-1.5 rounded-md text-xs font-medium border border-zinc-200 bg-white hover:bg-zinc-50 text-zinc-800 transition disabled:opacity-50 shrink-0"
                >
                  Reset Cooldown
                </button>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
};

