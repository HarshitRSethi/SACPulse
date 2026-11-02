import React from 'react';

interface AdminMetricsStripProps {
  todayCount: number;
  totalCount: number;
  restrictedCount: number;
  pendingWhitelistCount: number;
}

export const AdminMetricsStrip: React.FC<AdminMetricsStripProps> = ({
  todayCount,
  totalCount,
  restrictedCount,
  pendingWhitelistCount
}) => {
  const metrics = [
    { label: "Today's Checkouts", value: todayCount },
    { label: 'Total Ledger Entries', value: totalCount },
    { label: 'Restricted Students', value: restrictedCount },
    { label: 'Pending Access Requests', value: pendingWhitelistCount }
  ];

  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
      {metrics.map((m) => (
        <div
          key={m.label}
          className="bg-white border border-zinc-200 rounded-lg px-4 py-3"
        >
          <span className="text-[11px] text-zinc-500 block">{m.label}</span>
          <span className="text-xl font-semibold text-zinc-900 font-mono tabular-nums mt-0.5 block">
            {m.value}
          </span>
        </div>
      ))}
    </div>
  );
};

