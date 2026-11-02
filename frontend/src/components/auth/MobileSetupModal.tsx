import React, { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import type { User } from '../../types/index';
import { api } from '../../services/api';
import { AlertCircle, Loader2, Lock, Phone } from 'lucide-react';

interface MobileSetupModalProps {
  user: User;
  token?: string | null;
  onSuccess: (updatedUser: User) => void;
}

export const MobileSetupModal: React.FC<MobileSetupModalProps> = ({
  user,
  token,
  onSuccess
}) => {
  const [mobileNo, setMobileNo] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = '';
    };
  }, []);

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const clean = e.target.value.replace(/\D/g, '').slice(0, 10);
    setMobileNo(clean);
    if (error) setError(null);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const clean = mobileNo.trim();

    if (!/^[6-9]\d{9}$/.test(clean)) {
      setError('Enter a valid 10-digit Indian mobile number starting with 6, 7, 8, or 9.');
      return;
    }

    try {
      setIsSubmitting(true);
      setError(null);
      const updatedUser = await api.submitMobileSetup(clean, token || undefined);

      const activeToken = token || api.getStoredToken() || '';
      if (activeToken) {
        api.setStoredAuth(activeToken, updatedUser);
      }

      onSuccess(updatedUser);
    } catch (err: any) {
      setError(err.message || 'Failed to save mobile number.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return createPortal(
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="mobile-modal-title"
      className="fixed inset-0 z-[999] bg-zinc-950/50 backdrop-blur-xs overflow-y-auto flex items-center justify-center p-4"
    >
      <div className="max-w-md w-full bg-white rounded-xl shadow-xl border border-zinc-200 p-6">
        <div className="flex items-start gap-3 mb-5">
          <div className="w-9 h-9 rounded-lg bg-zinc-100 border border-zinc-200 flex items-center justify-center text-zinc-800 shrink-0">
            <Phone className="w-4 h-4" />
          </div>
          <div>
            <h2
              id="mobile-modal-title"
              className="text-base font-semibold text-zinc-900 tracking-tight"
            >
              Register Contact Number
            </h2>
            <p className="text-xs text-zinc-500 mt-0.5 leading-relaxed">
              Required once for SAC counter checkouts so desk staff can contact active
              holders if equipment or keys are overdue.
            </p>
          </div>
        </div>

        <div className="bg-zinc-50 rounded-lg px-3 py-2.5 border border-zinc-200 mb-4 flex items-center justify-between text-xs">
          <div className="min-w-0">
            <span className="font-medium text-zinc-900 block truncate">{user.name}</span>
            <span className="text-[11px] text-zinc-500 font-mono truncate block">
              {user.email}
            </span>
          </div>
          {user.rollNo && (
            <span className="px-2 py-0.5 rounded bg-white border border-zinc-200 font-mono font-medium text-zinc-700 text-[11px] shrink-0">
              {user.rollNo}
            </span>
          )}
        </div>

        {error && (
          <div className="mb-4 p-2.5 rounded-lg bg-red-50 border border-red-200 text-red-700 text-xs flex items-start gap-2">
            <AlertCircle className="w-4 h-4 text-red-600 shrink-0 mt-0.5" />
            <span>{error}</span>
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-xs font-medium text-zinc-700 mb-1.5">
              10-Digit Mobile Number
            </label>
            <div className="flex items-center rounded-lg border border-zinc-300 bg-white focus-within:border-zinc-900 transition overflow-hidden">
              <span className="px-3 py-2.5 bg-zinc-50 border-r border-zinc-200 text-zinc-600 font-mono text-xs select-none">
                +91
              </span>
              <input
                type="tel"
                value={mobileNo}
                onChange={handleInputChange}
                placeholder="9876543210"
                autoFocus
                className="w-full px-3 py-2.5 text-sm font-mono tabular-nums text-zinc-900 placeholder:text-zinc-400 focus:outline-none"
              />
              <span className="pr-3 text-[11px] font-mono tabular-nums text-zinc-400 select-none">
                {mobileNo.length}/10
              </span>
            </div>
          </div>

          <div className="p-2.5 rounded-lg bg-zinc-50 border border-zinc-200 text-[11px] text-zinc-500 flex items-start gap-2 leading-relaxed">
            <Lock className="w-3.5 h-3.5 text-zinc-400 shrink-0 mt-0.5" />
            <span>
              Redacted from student-facing campus feeds. Visible only to authorized SAC
              counter guards and administrators during active checkouts.
            </span>
          </div>

          <button
            type="submit"
            disabled={isSubmitting || mobileNo.length < 10}
            className="w-full py-2.5 px-4 rounded-lg bg-zinc-900 hover:bg-zinc-800 text-white font-medium text-xs disabled:opacity-50 transition flex items-center justify-center gap-2"
          >
            {isSubmitting ? (
              <>
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
                <span>Saving...</span>
              </>
            ) : (
              <span>Save & Continue</span>
            )}
          </button>
        </form>
      </div>
    </div>,
    document.body
  );
};
