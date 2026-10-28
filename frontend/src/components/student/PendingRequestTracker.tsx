import React, { useEffect, useState, useRef } from 'react';
import type { IssueRequest } from '../../types/index';
import { Clock, AlertTriangle, CheckCircle2, XCircle } from 'lucide-react';

interface PendingRequestTrackerProps {
  request: IssueRequest;
  onTimedOut?: () => void;
}

export const PendingRequestTracker: React.FC<PendingRequestTrackerProps> = ({
  request,
  onTimedOut
}) => {
  const calculateRemainingSeconds = () => {
    const expiresAt = new Date(request.expiresAt).getTime();
    const now = Date.now();
    return Math.max(0, Math.floor((expiresAt - now) / 1000));
  };

  const initialRemaining = calculateRemainingSeconds();
  const [remainingSeconds, setRemainingSeconds] = useState<number>(initialRemaining);
  const [isDismissed, setIsDismissed] = useState<boolean>(initialRemaining <= 0 || request.status !== 'PENDING');
  const hasTimedOutRef = useRef<boolean>(initialRemaining <= 0);

  useEffect(() => {
    const remaining = calculateRemainingSeconds();
    setRemainingSeconds(remaining);

    // If already expired at mount or status changed, notify and auto-dismiss
    if (remaining <= 0 || request.status !== 'PENDING') {
      setIsDismissed(true);
      if (!hasTimedOutRef.current) {
        hasTimedOutRef.current = true;
        onTimedOut?.();
      }
      return;
    }

    hasTimedOutRef.current = false;
    setIsDismissed(false);

    const interval = setInterval(() => {
      const currentRemaining = calculateRemainingSeconds();
      setRemainingSeconds(currentRemaining);

      if (currentRemaining <= 0) {
        clearInterval(interval);
        setIsDismissed(true);
        if (!hasTimedOutRef.current) {
          hasTimedOutRef.current = true;
          onTimedOut?.();
        }
      }
    }, 1000);

    return () => clearInterval(interval);
  }, [request.id, request.expiresAt, request.status]);

  // Auto-dismiss or show clean static expiry notice
  if (isDismissed || remainingSeconds <= 0 || request.status !== 'PENDING') {
    return (
      <div className="rounded-2xl p-4 bg-zinc-100 border border-[#E4E4E7] shadow-xs flex items-center justify-between gap-3 text-zinc-700 animate-in fade-in duration-200">
        <div className="flex items-center gap-2.5">
          <XCircle className="w-5 h-5 text-zinc-400 flex-shrink-0" />
          <p className="text-xs font-medium">
            Previous arrival window has concluded. You can select new equipment from the campus feed below.
          </p>
        </div>
        <button
          onClick={() => onTimedOut?.()}
          className="text-xs font-bold px-3 py-1.5 rounded-lg bg-white hover:bg-zinc-50 text-zinc-800 border border-zinc-200 transition shadow-xs"
        >
          Dismiss
        </button>
      </div>
    );
  }

  const totalTtl = 120; // 2 minutes authoritative server TTL
  const progressPercent = Math.min(100, Math.max(0, (remainingSeconds / totalTtl) * 100));

  const minutes = Math.floor(remainingSeconds / 60);
  const seconds = remainingSeconds % 60;
  const timeFormatted = `${minutes}:${seconds < 10 ? '0' : ''}${seconds}`;

  const isUrgent = remainingSeconds <= 30;
  const isWarning = remainingSeconds > 30 && remainingSeconds <= 60;

  return (
    <div
      className={`rounded-2xl p-4 sm:p-5 border transition-colors shadow-xs ${
        isUrgent
          ? 'bg-rose-50/90 border-rose-200 text-rose-950'
          : isWarning
          ? 'bg-amber-50/90 border-amber-200 text-amber-950'
          : 'bg-blue-50/90 border-blue-200 text-blue-950'
      }`}
    >
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-3">
        <div className="flex items-center gap-3">
          <div
            className={`w-10 h-10 rounded-xl flex items-center justify-center font-bold text-lg shadow-xs ${
              isUrgent
                ? 'bg-rose-600 text-white'
                : isWarning
                ? 'bg-amber-500 text-white'
                : 'bg-blue-600 text-white'
            }`}
          >
            <Clock className="w-5 h-5" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h2 className="font-bold text-base sm:text-lg text-zinc-900">
                Arrival Window Active
              </h2>
              <span className="text-[10px] px-2 py-0.5 rounded-full font-mono font-bold bg-white text-zinc-700 border border-zinc-200">
                PENDING APPROVAL
              </span>
            </div>
            <p className="text-xs text-zinc-600 mt-0.5">
              Walk to the SAC Guard Desk now. Present your student ID to complete issuance.
            </p>
          </div>
        </div>

        {/* Stable Countdown Timer Display */}
        <div className="text-right flex sm:flex-col items-center sm:items-end justify-between">
          <span className="text-[10px] uppercase text-zinc-500 font-bold tracking-wider">
            Time Remaining
          </span>
          <span
            className={`font-mono text-2xl sm:text-3xl font-extrabold tracking-tight ${
              isUrgent
                ? 'text-rose-600'
                : isWarning
                ? 'text-amber-600'
                : 'text-blue-600'
            }`}
          >
            {timeFormatted}
          </span>
        </div>
      </div>

      {/* Progress Bar */}
      <div className="w-full bg-zinc-200/80 rounded-full h-2 overflow-hidden">
        <div
          className={`h-full rounded-full transition-all duration-1000 ease-linear ${
            isUrgent
              ? 'bg-rose-500'
              : isWarning
              ? 'bg-amber-500'
              : 'bg-blue-600'
          }`}
          style={{ width: `${progressPercent}%` }}
        />
      </div>

      {/* Requested Items preview */}
      <div className="mt-4 pt-3 border-t border-zinc-200/60 flex flex-wrap items-center justify-between gap-2 text-xs">
        <div className="flex items-center gap-1.5 flex-wrap">
          <span className="text-zinc-500 font-medium">Requested Bundle:</span>
          {request.requestedItems.map((item, idx) => (
            <span
              key={idx}
              className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-lg bg-white text-zinc-800 border border-zinc-200 font-semibold"
            >
              <CheckCircle2 className="w-3.5 h-3.5 text-blue-600" />
              {item.name} <strong className="text-zinc-900 font-mono">x{item.qty}</strong>
            </span>
          ))}
        </div>

        <div className="flex items-center gap-1.5 text-zinc-500 italic text-[11px]">
          <AlertTriangle className="w-3.5 h-3.5 text-amber-600 flex-shrink-0" />
          <span>Manual cancel disabled by Anti-Hoarding policy</span>
        </div>
      </div>
    </div>
  );
};
