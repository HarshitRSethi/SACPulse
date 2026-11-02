import React, { useState, useEffect } from 'react';
import type { IssueRequest } from '../../types/index';
import { Check, Clock, Phone } from 'lucide-react';

interface GuardQueuePanelProps {
  requests: IssueRequest[];
  onApprove: (requestId: string) => void;
  isLoading: boolean;
}

const QueueRow: React.FC<{
  request: IssueRequest;
  onApprove: (requestId: string) => void;
  isLoading: boolean;
}> = ({ request, onApprove, isLoading }) => {
  const calculateRemaining = () => {
    const expiresVal = request.expiresAt || (request as any).expires_at;
    const expiresAt = expiresVal ? new Date(expiresVal).getTime() : 0;
    return Math.max(0, Math.floor((expiresAt - Date.now()) / 1000));
  };

  const [remaining, setRemaining] = useState<number>(calculateRemaining());

  useEffect(() => {
    setRemaining(calculateRemaining());
    const interval = setInterval(() => {
      setRemaining(calculateRemaining());
    }, 1000);
    return () => clearInterval(interval);
  }, [request.expiresAt]);

  const minutes = Math.floor(remaining / 60);
  const seconds = remaining % 60;
  const timeFormatted = `${minutes}:${seconds < 10 ? '0' : ''}${seconds}`;
  const isUrgent = remaining <= 30;

  const studentName = request.studentName || (request as any).student_name || 'Student';
  const rollNo = request.rollNo || (request as any).roll_no || 'N/A';
  const mobileNo = request.mobileNo || (request as any).mobile_no;
  const items =
    request.requestedItems ||
    (request as any).requested_items ||
    (request as any).items ||
    [];

  return (
    <div
      className={`p-3.5 rounded-lg border transition ${
        isUrgent ? 'bg-red-50/60 border-red-200' : 'bg-white border-zinc-200'
      }`}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <span className="text-xs font-semibold text-zinc-900 truncate">
              {studentName}
            </span>
            <span className="font-mono text-[11px] px-1.5 py-0.5 rounded bg-zinc-100 text-zinc-700 border border-zinc-200">
              {rollNo}
            </span>
          </div>

          {mobileNo && (
            <a
              href={`tel:${mobileNo}`}
              className="inline-flex items-center gap-1 text-[11px] text-zinc-500 hover:text-zinc-900 mt-1 font-mono tabular-nums"
            >
              <Phone className="w-3 h-3" />
              <span>{mobileNo}</span>
            </a>
          )}
        </div>

        <span
          className={`inline-flex items-center gap-1 px-2 py-0.5 rounded font-mono text-xs font-semibold tabular-nums shrink-0 ${
            isUrgent
              ? 'bg-red-100 text-red-800'
              : 'bg-zinc-100 text-zinc-800 border border-zinc-200'
          }`}
        >
          <Clock className="w-3 h-3" />
          <span>{timeFormatted}</span>
        </span>
      </div>

      <div className="mt-2.5 flex flex-wrap gap-1.5">
        {items.map((item: any, idx: number) => (
          <span
            key={idx}
            className="px-2 py-0.5 rounded text-xs bg-zinc-50 text-zinc-800 border border-zinc-200"
          >
            {item.name || item.itemName}{' '}
            <strong className="font-mono tabular-nums">
              ×{item.qty || item.quantity || 1}
            </strong>
          </span>
        ))}
      </div>

      <div className="mt-3 pt-2.5 border-t border-zinc-100 flex justify-end">
        <button
          onClick={() => onApprove(request.id)}
          disabled={isLoading || remaining <= 0}
          className="w-full py-2 px-3 rounded-md text-xs font-medium text-white bg-zinc-900 hover:bg-zinc-800 disabled:opacity-45 transition inline-flex items-center justify-center gap-1.5"
        >
          <Check className="w-3.5 h-3.5" />
          <span>Approve & Issue</span>
        </button>
      </div>
    </div>
  );
};

export const GuardQueuePanel: React.FC<GuardQueuePanelProps> = ({
  requests,
  onApprove,
  isLoading
}) => {
  return (
    <section className="space-y-2.5">
      <div className="flex items-center justify-between">
        <h2 className="text-xs font-semibold uppercase tracking-wider text-zinc-600">
          Incoming Pickup Queue ({requests.length})
        </h2>
        <span className="text-[11px] font-mono text-zinc-400">120s TTL</span>
      </div>

      {requests.length === 0 ? (
        <div className="bg-white border border-zinc-200 rounded-lg p-6 text-center">
          <p className="text-xs font-medium text-zinc-700">Queue empty</p>
          <p className="text-[11px] text-zinc-500 mt-0.5">
            Walk-up student checkout requests appear here in real time.
          </p>
        </div>
      ) : (
        <div className="space-y-2.5">
          {requests.map((req) => (
            <QueueRow
              key={req.id}
              request={req}
              onApprove={onApprove}
              isLoading={isLoading}
            />
          ))}
        </div>
      )}
    </section>
  );
};

