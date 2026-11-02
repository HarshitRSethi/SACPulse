import React, { useState } from 'react';
import type { User } from '../../types/index';
import { Phone } from 'lucide-react';

interface StaffWhitelistTabProps {
  currentUser: User;
  isRootAdmin: boolean;
  initialAdminEmail: string;
  pendingRequests: any[];
  activeUsers: any[];
  actionLoadingId: string | null;
  onApproveRequest: (requestId: string, role: 'STUDENT' | 'GUARD' | 'ADMIN') => Promise<void>;
  onRejectRequest: (requestId: string) => Promise<void>;
  onDirectAdd: (payload: {
    email: string;
    name: string;
    mobileNo?: string;
    role: 'STUDENT' | 'GUARD' | 'ADMIN';
  }) => Promise<void>;
  onRevokeAccess: (staffId: string) => Promise<void>;
}

export const StaffWhitelistTab: React.FC<StaffWhitelistTabProps> = ({
  currentUser,
  isRootAdmin,
  initialAdminEmail,
  pendingRequests,
  activeUsers,
  actionLoadingId,
  onApproveRequest,
  onRejectRequest,
  onDirectAdd,
  onRevokeAccess
}) => {
  const [selectedRoles, setSelectedRoles] = useState<
    Record<string, 'STUDENT' | 'GUARD' | 'ADMIN'>
  >({});

  const [email, setEmail] = useState('');
  const [name, setName] = useState('');
  const [mobile, setMobile] = useState('');
  const [role, setRole] = useState<'STUDENT' | 'GUARD' | 'ADMIN'>('GUARD');
  const [isAdding, setIsAdding] = useState(false);

  const handleDirectSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim() || !name.trim()) return;
    try {
      setIsAdding(true);
      await onDirectAdd({
        email: email.trim(),
        name: name.trim(),
        mobileNo: mobile.trim() || undefined,
        role
      });
      setEmail('');
      setName('');
      setMobile('');
    } finally {
      setIsAdding(false);
    }
  };

  return (
    <div className="space-y-5">
      {/* Pending Access Requests */}
      <section className="bg-white border border-zinc-200 rounded-lg overflow-hidden">
        <div className="px-4 py-2.5 bg-zinc-50/80 border-b border-zinc-200 flex items-center justify-between">
          <h3 className="text-xs font-semibold text-zinc-800">
            Pending External Access Requests ({pendingRequests.length})
          </h3>
          <span className="text-[11px] text-zinc-500">
            Non-@iiita.ac.in staff & visitors
          </span>
        </div>

        {pendingRequests.length === 0 ? (
          <div className="p-6 text-center text-xs text-zinc-500">
            No pending external whitelist requests.
          </div>
        ) : (
          <div className="divide-y divide-zinc-100">
            {pendingRequests.map((req) => {
              const chosenRole = selectedRoles[req.id] || 'GUARD';
              const isBusy = actionLoadingId === req.id;

              return (
                <div
                  key={req.id}
                  className="px-4 py-3 flex flex-col sm:flex-row sm:items-center justify-between gap-3"
                >
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-semibold text-zinc-900">
                        {req.name}
                      </span>
                      <span className="font-mono text-[11px] text-zinc-500">
                        {req.email}
                      </span>
                    </div>
                    <div className="flex flex-wrap items-center gap-2 text-[11px] text-zinc-500 mt-0.5">
                      {req.mobile_no && (
                        <span className="font-mono tabular-nums">+91 {req.mobile_no}</span>
                      )}
                      {req.reason && <span>· &ldquo;{req.reason}&rdquo;</span>}
                    </div>
                  </div>

                  <div className="flex items-center gap-2 self-end sm:self-auto">
                    <select
                      value={chosenRole}
                      onChange={(e) =>
                        setSelectedRoles((prev) => ({
                          ...prev,
                          [req.id]: e.target.value as 'STUDENT' | 'GUARD' | 'ADMIN'
                        }))
                      }
                      className="h-8 bg-white border border-zinc-200 rounded-md px-2 text-xs text-zinc-800 focus:outline-none focus:border-zinc-900"
                    >
                      <option value="GUARD">Guard</option>
                      <option value="STUDENT">Student</option>
                      {isRootAdmin && <option value="ADMIN">Admin</option>}
                    </select>

                    <button
                      onClick={() => onApproveRequest(req.id, chosenRole)}
                      disabled={isBusy}
                      className="h-8 px-3 rounded-md text-xs font-medium bg-zinc-900 hover:bg-zinc-800 text-white transition disabled:opacity-50"
                    >
                      Approve
                    </button>

                    <button
                      onClick={() => onRejectRequest(req.id)}
                      disabled={isBusy}
                      className="h-8 px-3 rounded-md text-xs font-medium border border-zinc-200 bg-white hover:bg-zinc-50 text-zinc-700 transition disabled:opacity-50"
                    >
                      Reject
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </section>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-start">
        {/* Direct Authorize Form */}
        <form
          onSubmit={handleDirectSubmit}
          className="lg:col-span-4 bg-white border border-zinc-200 rounded-lg p-4 space-y-3"
        >
          <div className="pb-2 border-b border-zinc-100">
            <h3 className="text-xs font-semibold text-zinc-900">
              Direct Authorize Account
            </h3>
            <p className="text-[11px] text-zinc-500 mt-0.5">
              Pre-authorize external Google accounts for counter duty.
            </p>
          </div>

          <div>
            <label className="block text-xs font-medium text-zinc-700 mb-1">
              Full Name
            </label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Ramesh Kumar"
              required
              className="w-full h-8 px-2.5 rounded-md border border-zinc-300 text-xs focus:outline-none focus:border-zinc-900"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-zinc-700 mb-1">
              Google Email
            </label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="guard.sac@gmail.com"
              required
              className="w-full h-8 px-2.5 rounded-md border border-zinc-300 text-xs font-mono focus:outline-none focus:border-zinc-900"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-zinc-700 mb-1">
              Mobile Number (Optional)
            </label>
            <input
              type="tel"
              value={mobile}
              onChange={(e) => setMobile(e.target.value.replace(/\D/g, '').slice(0, 10))}
              placeholder="9876543210"
              className="w-full h-8 px-2.5 rounded-md border border-zinc-300 text-xs font-mono tabular-nums focus:outline-none focus:border-zinc-900"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-zinc-700 mb-1">
              Assigned Role
            </label>
            <select
              value={role}
              onChange={(e) =>
                setRole(e.target.value as 'STUDENT' | 'GUARD' | 'ADMIN')
              }
              className="w-full h-8 px-2.5 rounded-md border border-zinc-300 text-xs bg-white focus:outline-none focus:border-zinc-900"
            >
              <option value="GUARD">Guard</option>
              <option value="STUDENT">Student</option>
              {isRootAdmin && <option value="ADMIN">Admin</option>}
            </select>
          </div>

          <button
            type="submit"
            disabled={isAdding || !email.trim() || !name.trim()}
            className="w-full py-2 px-3 rounded-md text-xs font-medium bg-zinc-900 hover:bg-zinc-800 text-white transition disabled:opacity-50"
          >
            {isAdding ? 'Authorizing...' : 'Authorize Account'}
          </button>
        </form>

        {/* Active Whitelisted Staff */}
        <section className="lg:col-span-8 bg-white border border-zinc-200 rounded-lg overflow-hidden">
          <div className="px-4 py-2.5 bg-zinc-50/80 border-b border-zinc-200 flex items-center justify-between">
            <h3 className="text-xs font-semibold text-zinc-800">
              Authorized External Staff ({activeUsers.length})
            </h3>
            <span className="text-[11px] text-zinc-500">
              {isRootAdmin ? 'Root Admin privileges active' : 'Delegated Admin view'}
            </span>
          </div>

          {activeUsers.length === 0 ? (
            <div className="p-8 text-center text-xs text-zinc-500">
              No external accounts are currently whitelisted.
            </div>
          ) : (
            <div className="divide-y divide-zinc-100">
              {activeUsers.map((staff) => {
                const staffEmail = (staff.email || '').toLowerCase().trim();
                const isTargetRoot =
                  Boolean(initialAdminEmail) &&
                  staffEmail === initialAdminEmail.toLowerCase().trim();
                const isSelf =
                  staffEmail === currentUser.email.toLowerCase().trim();
                const isTargetAdmin =
                  (staff.role || '').toUpperCase() === 'ADMIN';
                const canRevoke =
                  !isTargetRoot && !isSelf && (!isTargetAdmin || isRootAdmin);

                return (
                  <div
                    key={staff.id}
                    className="px-4 py-3 flex items-center justify-between gap-3"
                  >
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-semibold text-zinc-900 truncate">
                          {staff.name}
                        </span>
                        <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-zinc-100 text-zinc-700 border border-zinc-200">
                          {staff.role}
                        </span>
                        {isTargetRoot && (
                          <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-zinc-900 text-white">
                            Root
                          </span>
                        )}
                      </div>
                      <div className="flex items-center gap-2 text-[11px] text-zinc-500 mt-0.5 font-mono">
                        <span className="truncate">{staff.email}</span>
                        {staff.mobile_no && (
                          <a
                            href={`tel:${staff.mobile_no}`}
                            className="inline-flex items-center gap-0.5 tabular-nums hover:text-zinc-900"
                          >
                            <Phone className="w-2.5 h-2.5" />
                            {staff.mobile_no}
                          </a>
                        )}
                      </div>
                    </div>

                    {canRevoke ? (
                      <button
                        onClick={() => onRevokeAccess(staff.id)}
                        disabled={actionLoadingId === staff.id}
                        className="px-2.5 py-1 rounded-md text-xs font-medium border border-red-200 bg-red-50/70 hover:bg-red-100 text-red-700 transition disabled:opacity-50 shrink-0"
                      >
                        Revoke
                      </button>
                    ) : (
                      <span className="text-[11px] text-zinc-400 shrink-0">
                        {isTargetRoot
                          ? 'Protected'
                          : isSelf
                            ? 'Current session'
                            : 'Root required'}
                      </span>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </section>
      </div>
    </div>
  );
};

