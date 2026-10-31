import React, { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import type { User } from '../../types/index';
import { api } from '../../services/api';
import { Phone, ShieldCheck, AlertCircle, Loader2, Lock } from 'lucide-react';

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

  // Prevent background scrolling when modal is mounted
  useEffect(() => {
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = '';
    };
  }, []);

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    // Keep only numbers and max 10 digits
    const clean = e.target.value.replace(/\D/g, '').slice(0, 10);
    setMobileNo(clean);
    if (error) setError(null);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const clean = mobileNo.trim();

    // Validate Indian 10-digit format (/^[6-9]\d{9}$/)
    if (!/^[6-9]\d{9}$/.test(clean)) {
      setError('Please enter a valid 10-digit Indian mobile number starting with 6, 7, 8, or 9.');
      return;
    }

    try {
      setIsSubmitting(true);
      setError(null);
      const updatedUser = await api.submitMobileSetup(clean, token || undefined, user.id);
      
      // Update local storage
      const activeToken = token || api.getStoredToken() || '';
      if (activeToken) {
        api.setStoredAuth(activeToken, updatedUser);
      }
      
      onSuccess(updatedUser);
    } catch (err: any) {
      console.error('Failed to submit mobile setup:', err);
      setError(err.message || 'Failed to save mobile number. Please try again.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return createPortal(
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="mobile-modal-title"
      className="fixed inset-0 z-[999] bg-zinc-950/75 backdrop-blur-md overflow-y-auto flex items-center justify-center p-4 animate-in fade-in duration-200"
    >
      <div className="max-w-md w-full bg-white rounded-3xl shadow-2xl border border-zinc-200 p-6 sm:p-7 relative overflow-hidden transition-all">
        {/* Subtle decorative top bar */}
        <div className="absolute top-0 left-0 right-0 h-1.5 bg-gradient-to-r from-blue-600 via-indigo-600 to-purple-600" />

        {/* Modal Header */}
        <div className="flex items-start gap-4 mb-5">
          <div className="w-12 h-12 rounded-2xl bg-blue-50 border border-blue-200/80 flex items-center justify-center text-blue-600 shrink-0 shadow-sm">
            <Phone className="w-6 h-6" />
          </div>
          <div>
            <span className="text-[11px] font-mono font-bold tracking-wider uppercase text-blue-600 bg-blue-50 px-2 py-0.5 rounded-md border border-blue-100 inline-block mb-1">
              One-Time Setup
            </span>
            <h2 id="mobile-modal-title" className="text-xl font-extrabold text-zinc-900 tracking-tight">
              Equipment Checkout Contact
            </h2>
            <p className="text-xs text-zinc-500 mt-1 leading-relaxed">
              Enter your 10-digit calling number for SAC equipment checkout. The guard desk and transfer peers use this to reach you during active holdings.
            </p>
          </div>
        </div>

        {/* User Identity Chip */}
        <div className="bg-zinc-50 rounded-2xl p-3 border border-zinc-200/80 mb-5 flex items-center justify-between text-xs">
          <div>
            <span className="font-bold text-zinc-800 block">{user.name}</span>
            <span className="text-[11px] text-zinc-500 font-mono">{user.email}</span>
          </div>
          {user.rollNo && (
            <span className="px-2 py-0.5 rounded-lg bg-white border border-zinc-200 font-mono font-bold text-zinc-700 text-[11px]">
              {user.rollNo}
            </span>
          )}
        </div>

        {/* Error Alert */}
        {error && (
          <div className="mb-4 p-3 rounded-2xl bg-red-50 border border-red-200 text-red-700 text-xs flex items-start gap-2.5 animate-in slide-in-from-top-1">
            <AlertCircle className="w-4 h-4 text-red-600 shrink-0 mt-0.5" />
            <span className="leading-snug">{error}</span>
          </div>
        )}

        {/* Form */}
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-xs font-bold text-zinc-700 uppercase tracking-wider mb-1.5">
              Calling Mobile Number
            </label>
            <div className="relative flex items-center rounded-2xl border border-zinc-300 bg-white focus-within:border-blue-600 focus-within:ring-2 focus-within:ring-blue-100 transition shadow-sm overflow-hidden">
              <span className="px-3.5 py-3 bg-zinc-100 border-r border-zinc-200 text-zinc-700 font-mono font-bold text-sm select-none flex items-center gap-1.5">
                <span>🇮🇳</span>
                <span>+91</span>
              </span>
              <input
                type="tel"
                value={mobileNo}
                onChange={handleInputChange}
                placeholder="9876543210"
                autoFocus
                className="w-full px-3.5 py-3 text-base sm:text-lg font-mono font-semibold text-zinc-900 placeholder:text-zinc-400 focus:outline-none tracking-wider"
              />
              <span className="pr-3 text-[11px] font-mono text-zinc-400 select-none">
                {mobileNo.length}/10
              </span>
            </div>
          </div>

          <div className="p-3 rounded-xl bg-zinc-50 border border-zinc-200/60 text-[11px] text-zinc-500 flex items-start gap-2 leading-relaxed">
            <Lock className="w-3.5 h-3.5 text-zinc-400 shrink-0 mt-0.5" />
            <span>
              <strong>Privacy Guaranteed:</strong> Your mobile number is never displayed on public feeds or shared with third parties. Used strictly for SAC register contact.
            </span>
          </div>

          <button
            type="submit"
            disabled={isSubmitting || mobileNo.length < 10}
            className="w-full py-3.5 px-4 rounded-2xl bg-zinc-900 hover:bg-black text-white font-bold text-sm tracking-wide shadow-md hover:shadow-lg disabled:opacity-50 disabled:cursor-not-allowed transition flex items-center justify-center gap-2"
          >
            {isSubmitting ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin text-white" />
                <span>Saving Number...</span>
              </>
            ) : (
              <>
                <ShieldCheck className="w-4 h-4 text-emerald-400" />
                <span>Verify & Complete Setup</span>
              </>
            )}
          </button>
        </form>
      </div>
    </div>,
    document.body
  );
};
