import React, { useEffect, useState, useRef } from 'react';
import type { IssueRequest } from '../../types/index';
import { Clock } from 'lucide-react';

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
    return Math.max(0, Math.floor((expiresAt - Date.now()) / 1000));
  };

  const initialRemaining = calculateRemainingSeconds();
  const [remainingSeconds, setRemainingSeconds] = useState<number>(initialRemaining);
  const hasTimedOutRef = useRef<boolean>(initialRemaining <= 0);

  useEffect(() => {
    const remaining = calculateRemainingSeconds();
    setRemainingSeconds(remaining);

    if (remaining <= 0 || request.status !== 'PENDING') {
      if (!hasTimedOutRef.current) {
        hasTimedOutRef.current = true;
        onTimedOut?.();
      }
      return;
    }

    hasTimedOutRef.current = false;

    const interval = setInterval(() => {
      const next = calculateRemainingSeconds();
      setRemainingSeconds(next);
      if (next <= 0) {
        clearInterval(interval);
        if (!hasTimedOutRef.current) {
          hasTimedOutRef.current = true;
          onTimedOut?.();
        }
      }
    }, 1000);

    return () => clearInterval(interval);
  }, [request.id, request.expiresAt, request.status]);

  if (remainingSeconds <= 0 || request.status !== 'PENDING') {
    return null;
  }

  const totalTtl = request.ttlSeconds || 120;
  const progressPercent = Math.min(100, Math.max(0, (remainingSeconds / totalTtl) * 100));
  const minutes = Math.floor(remainingSeconds / 60);
  const seconds = remainingSeconds % 60;
  const timeFormatted = `${minutes}:${seconds < 10 ? '0' : ''}${seconds}`;
  const isUrgent = remainingSeconds <= 30;

  return (
    <div
      className={`rounded-lg p-4 border ${
        isUrgent
          ? 'bg-red-50/70 border-red-200'
          : 'bg-white border-zinc-200'
      }`}
    >
      <div className="flex items-center justify-between gap-4">
        <div className="flex items-start gap-3">
          <div
            className={`w-8 h-8 rounded-md flex items-center justify-center shrink-0 ${
              isUrgent ? 'bg-red-600 text-white' : 'bg-zinc-900 text-white'
            }`}
          >
            <Clock className="w-4 h-4" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-xs font-semibold text-zinc-900">
                Counter Pickup Window Active
              </h2>
              <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-zinc-100 text-zinc-600 border border-zinc-200">
                PENDING
              </span>
            </div>
            <p className="text-xs text-zinc-500 mt-0.5">
              Report to the SAC Guard Desk with your ID card before the timer expires.
            </p>
          </div>
        </div>

        <span
          className={`font-mono text-2xl font-semibold tabular-nums ${
            isUrgent ? 'text-red-600' : 'text-zinc-900'
          }`}
        >
          {timeFormatted}
        </span>
      </div>

      <div className="w-full bg-zinc-100 rounded-full h-1 overflow-hidden mt-3">
        <div
          className={`h-full transition-all duration-1000 ease-linear ${
            isUrgent ? 'bg-red-500' : 'bg-zinc-900'
          }`}
          style={{ width: `${progressPercent}%` }}
        />
      </div>

      <div className="mt-3 pt-2.5 border-t border-zinc-100 flex flex-wrap items-center justify-between gap-2 text-xs">
        <div className="flex items-center gap-1.5 flex-wrap">
          <span className="text-zinc-500">Bundle:</span>
          {request.requestedItems.map((item, idx) => (
            <span
              key={idx}
              className="px-2 py-0.5 rounded bg-zinc-50 text-zinc-800 border border-zinc-200 font-medium"
            >
              {item.name} <span className="font-mono text-zinc-500">×{item.qty}</span>
            </span>
          ))}
        </div>
        <span className="text-[11px] text-zinc-400">
          Manual cancellation disabled
        </span>
      </div>
    </div>
  );
};
