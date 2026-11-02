import React, { useEffect, useState } from 'react';
import type { IncomingTransfer, User } from '../../types/index';
import { ArrowRightLeft, ShieldAlert, Timer } from 'lucide-react';

interface StudentBannersProps {
  user: User;
  incomingTransfers: IncomingTransfer[];
  onAcceptTransfer: (entryId: string) => void;
  onDeclineTransfer: (entryId: string) => void;
}

export const StudentBanners: React.FC<StudentBannersProps> = ({
  user,
  incomingTransfers,
  onAcceptTransfer,
  onDeclineTransfer
}) => {
  const [cooldownRemaining, setCooldownRemaining] = useState<string | null>(null);

  useEffect(() => {
    if (!user.penaltyUntil) {
      setCooldownRemaining(null);
      return;
    }

    const updateTimer = () => {
      const diff = new Date(user.penaltyUntil!).getTime() - Date.now();
      if (diff <= 0) {
        setCooldownRemaining(null);
      } else {
        const hours = Math.floor(diff / (1000 * 60 * 60));
        const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
        const seconds = Math.floor((diff % (1000 * 60)) / 1000);
        setCooldownRemaining(`${hours}h ${minutes}m ${seconds}s`);
      }
    };

    updateTimer();
    const interval = setInterval(updateTimer, 1000);
    return () => clearInterval(interval);
  }, [user.penaltyUntil]);

  if (!user.isDefaulter && !cooldownRemaining && incomingTransfers.length === 0) {
    return null;
  }

  return (
    <aside aria-label="Account alerts" className="space-y-2.5">
      {user.isDefaulter && (
        <div className="rounded-lg p-3.5 bg-red-50 border border-red-200 flex items-start gap-3">
          <ShieldAlert className="w-4 h-4 text-red-600 shrink-0 mt-0.5" />
          <div className="text-xs">
            <h2 className="font-semibold text-red-900">
              Account Restricted — Damaged Return Logged
            </h2>
            <p className="text-red-800/90 mt-0.5 leading-relaxed">
              An item returned under your roll number was logged as damaged at the SAC
              desk. Checkouts and incoming transfers remain locked until cleared by SAC
              Administration.
            </p>
          </div>
        </div>
      )}

      {cooldownRemaining && (
        <div className="rounded-lg p-3.5 bg-amber-50 border border-amber-200 flex items-start justify-between gap-3">
          <div className="flex items-start gap-3 text-xs">
            <Timer className="w-4 h-4 text-amber-700 shrink-0 mt-0.5" />
            <div>
              <h2 className="font-semibold text-amber-900">
                Timeout Cooldown Active
              </h2>
              <p className="text-amber-800/90 mt-0.5 leading-relaxed">
                More than 3 counter pickup requests expired within 1 hour. Checkout access
                resumes automatically when the cooldown ends.
              </p>
            </div>
          </div>
          <span className="font-mono text-xs font-semibold tabular-nums text-amber-900 bg-amber-100 px-2 py-0.5 rounded shrink-0">
            {cooldownRemaining}
          </span>
        </div>
      )}

      {incomingTransfers.map((transfer) => (
        <div
          key={transfer.entryId}
          className="rounded-lg p-3.5 bg-white border border-zinc-300 shadow-xs flex flex-col sm:flex-row sm:items-center justify-between gap-3"
        >
          <div className="flex items-start gap-3 text-xs">
            <ArrowRightLeft className="w-4 h-4 text-zinc-700 shrink-0 mt-0.5" />
            <div>
              <span className="font-semibold text-zinc-900">
                Incoming Peer Transfer: {transfer.itemName}
              </span>
              <p className="text-zinc-500 mt-0.5">
                From <strong className="text-zinc-800">{transfer.fromStudentName}</strong>{' '}
                (<span className="font-mono">{transfer.fromRollNo}</span>)
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 self-end sm:self-auto">
            <button
              onClick={() => onDeclineTransfer(transfer.entryId)}
              className="px-3 py-1.5 rounded-md text-xs font-medium border border-zinc-200 bg-white hover:bg-zinc-50 text-zinc-700 transition"
            >
              Decline
            </button>
            <button
              onClick={() => onAcceptTransfer(transfer.entryId)}
              className="px-3 py-1.5 rounded-md text-xs font-medium bg-zinc-900 hover:bg-zinc-800 text-white transition"
            >
              Accept Responsibility
            </button>
          </div>
        </div>
      ))}
    </aside>
  );
};
