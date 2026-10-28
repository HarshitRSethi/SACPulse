import React, { useEffect, useState } from 'react';
import type { User, IncomingTransfer } from '../../types/index';
import { Timer, ArrowRightLeft, Check, X, ShieldAlert } from 'lucide-react';

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
  // Cooldown countdown timer
  const [cooldownRemaining, setCooldownRemaining] = useState<string | null>(null);

  useEffect(() => {
    if (!user.penaltyUntil) {
      setCooldownRemaining(null);
      return;
    }

    const updateTimer = () => {
      const penaltyTime = new Date(user.penaltyUntil!).getTime();
      const now = Date.now();
      const diff = penaltyTime - now;

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

  return (
    <aside aria-label="Student account notifications and alerts" className="space-y-3">
      {/* 1. Red Defaulter Banner */}
      {user.isDefaulter && (
        <div className="rounded-2xl p-4 sm:p-5 bg-rose-50/90 border border-rose-200 shadow-xs flex items-start gap-3.5">
          <div className="p-2 rounded-xl bg-rose-600 text-white flex-shrink-0">
            <ShieldAlert className="w-5 h-5" />
          </div>
          <div className="flex-1">
            <div className="flex items-center gap-2">
              <h2 className="text-xs sm:text-sm font-bold text-rose-900 uppercase tracking-wider">
                SAC Defaulter Account Flagged
              </h2>
              <span className="text-[10px] uppercase font-bold px-2 py-0.5 rounded-full bg-rose-200/80 text-rose-800">
                Action Required
              </span>
            </div>
            <p className="text-xs text-rose-700/90 mt-1 leading-relaxed">
              Equipment previously issued to your roll number was reported damaged or missing by SAC staff.
              New equipment requests and room key checkouts are suspended until you report to SAC Administration and clear this flag.
            </p>
          </div>
        </div>
      )}

      {/* 2. Orange 5-Hour Cooldown Timer Banner */}
      {cooldownRemaining && (
        <div className="rounded-2xl p-4 sm:p-5 bg-amber-50/90 border border-amber-200 shadow-xs flex items-start gap-3.5">
          <div className="p-2 rounded-xl bg-amber-500 text-white flex-shrink-0">
            <Timer className="w-5 h-5" />
          </div>
          <div className="flex-1">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-1">
              <h2 className="text-xs sm:text-sm font-bold text-amber-900 uppercase tracking-wider flex items-center gap-2">
                5-Hour Slot Hoarding Cooldown Active
              </h2>
              <span className="font-mono text-xs font-bold text-amber-900 bg-amber-200/70 px-2 py-0.5 rounded-md">
                {cooldownRemaining} remaining
              </span>
            </div>
            <p className="text-xs text-amber-800/90 mt-1 leading-relaxed">
              You exceeded 3 unfulfilled requests within a 1-hour window. Under the SAC Fair Allocation Policy,
              your checkout capability is temporarily paused.
            </p>
          </div>
        </div>
      )}

      {/* 3. Blue Incoming Transfer Cards */}
      {incomingTransfers.length > 0 && (
        <div className="space-y-2">
          {incomingTransfers.map((transfer) => (
            <div
              key={transfer.entryId}
              className="rounded-2xl p-4 sm:p-5 bg-blue-50/90 border border-blue-200 shadow-xs flex flex-col sm:flex-row sm:items-center justify-between gap-3"
            >
              <div className="flex items-start gap-3">
                <div className="p-2 rounded-xl bg-blue-600 text-white flex-shrink-0">
                  <ArrowRightLeft className="w-5 h-5" />
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <h2 className="text-xs sm:text-sm font-bold text-blue-950">
                      Incoming Equipment Transfer
                    </h2>
                    <span className="text-[10px] uppercase font-bold px-2 py-0.5 rounded-full bg-blue-200/70 text-blue-800">
                      Peer Handover
                    </span>
                  </div>
                  <p className="text-xs text-blue-900/90 mt-0.5">
                    <strong className="text-zinc-900">{transfer.fromStudentName}</strong> ({transfer.fromRollNo})
                    wants to transfer <strong className="text-blue-700">{transfer.itemName}</strong> ({transfer.category}) to you.
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-2 self-end sm:self-auto">
                <button
                  onClick={() => onDeclineTransfer(transfer.entryId)}
                  className="px-3 py-1.5 rounded-xl text-xs font-semibold bg-white hover:bg-zinc-100 text-zinc-700 border border-zinc-200 transition flex items-center gap-1.5 shadow-xs"
                >
                  <X className="w-3.5 h-3.5" /> Decline
                </button>
                <button
                  onClick={() => onAcceptTransfer(transfer.entryId)}
                  className="px-3.5 py-1.5 rounded-xl text-xs font-bold bg-blue-600 hover:bg-blue-500 text-white shadow-xs transition flex items-center gap-1.5"
                >
                  <Check className="w-3.5 h-3.5" /> Accept Transfer
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </aside>
  );
};
