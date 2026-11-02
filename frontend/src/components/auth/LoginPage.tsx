import React, { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { GoogleLogin, type CredentialResponse } from '@react-oauth/google';
import type { User } from '../../types/index';
import { api } from '../../services/api';
import { BrandMark } from '../BrandMark';
import { PRESET_USERS, type DevUserPreset } from '../DevRoleSwitcher';
import {
  AlertCircle,
  CheckCircle2,
  Loader2,
  Send,
  ShieldAlert,
  X
} from 'lucide-react';

interface LoginPageProps {
  onLoginSuccess: (user: User, token: string, requiresMobileSetup: boolean) => void;
  demoModeEnabled?: boolean;
  onSelectDemoPreset?: (preset: DevUserPreset) => void;
  isSwitchingDemo?: boolean;
}

export const LoginPage: React.FC<LoginPageProps> = ({
  onLoginSuccess,
  demoModeEnabled = false,
  onSelectDemoPreset,
  isSwitchingDemo = false
}) => {
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [accessRequest, setAccessRequest] = useState<{
    isOpen: boolean;
    email: string;
    name: string;
    isSubmitted: boolean;
    status?: string;
  } | null>(null);
  const [requestMobileNo, setRequestMobileNo] = useState('');
  const [requestReason, setRequestReason] = useState('');
  const [isSubmittingRequest, setIsSubmittingRequest] = useState(false);
  const [requestError, setRequestError] = useState<string | null>(null);

  useEffect(() => {
    document.body.style.overflow = accessRequest?.isOpen ? 'hidden' : '';
    return () => {
      document.body.style.overflow = '';
    };
  }, [accessRequest?.isOpen]);

  const handleGoogleSuccess = async (response: CredentialResponse) => {
    if (!response.credential) {
      setError('Google Sign-In failed: No credential token received.');
      return;
    }

    try {
      setIsLoading(true);
      setError(null);
      const res = await api.loginWithGoogle({ credential: response.credential });
      api.setStoredAuth(res.token, res.user);
      onLoginSuccess(res.user, res.token, res.requiresMobileSetup);
    } catch (err: any) {
      if (err.code === 'ACCESS_RESTRICTED' || err.message?.includes('Access restricted')) {
        setAccessRequest({
          isOpen: true,
          email: err.userEmail || '',
          name: err.userName || '',
          isSubmitted: err.whitelistStatus === 'PENDING',
          status: err.whitelistStatus
        });
        setRequestMobileNo('');
        setRequestReason('');
        setError(null);
      } else {
        setError(err.message || 'Authentication failed. Please sign in with your IIITA account.');
      }
    } finally {
      setIsLoading(false);
    }
  };

  const handleGoogleError = () => {
    setError('Google Sign-In was cancelled or could not complete.');
  };

  const handleAccessRequestSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!accessRequest) return;

    const cleanMobile = requestMobileNo.trim();
    if (!/^[6-9]\d{9}$/.test(cleanMobile)) {
      setRequestError(
        'Enter a valid 10-digit Indian mobile number starting with 6, 7, 8, or 9.'
      );
      return;
    }

    try {
      setIsSubmittingRequest(true);
      setRequestError(null);
      await api.requestWhitelist({
        email: accessRequest.email,
        name: accessRequest.name || accessRequest.email.split('@')[0],
        mobileNo: cleanMobile,
        reason: requestReason.trim() || undefined
      });
      setAccessRequest({ ...accessRequest, isSubmitted: true });
    } catch (err: any) {
      setRequestError(err.message || 'Failed to submit access request.');
    } finally {
      setIsSubmittingRequest(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#FAFAFB] text-zinc-900 flex flex-col justify-between">
      {/* Top Institutional Bar */}
      <header className="border-b border-zinc-200 bg-white px-6 h-14 flex items-center">
        <div className="max-w-5xl w-full mx-auto flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <BrandMark size="sm" />
            <span className="text-sm font-semibold tracking-tight text-zinc-900">
              SACPulse
            </span>
            <span className="text-[11px] font-mono text-zinc-500 border-l border-zinc-200 pl-2.5">
              IIIT Allahabad
            </span>
          </div>
          <span className="text-xs text-zinc-500 hidden sm:inline">
            Student Activity Centre Register
          </span>
        </div>
      </header>

      {/* Centered Clean Sign-In Card */}
      <main className="flex-1 flex items-center justify-center px-4 py-12">
        <div className="w-full max-w-md space-y-4">
          <div className="bg-white rounded-xl border border-zinc-200 shadow-xs p-7">
            <div className="space-y-1.5 mb-6">
              <p className="text-[11px] font-mono uppercase tracking-wider text-zinc-500">
                Institutional Sign-In
              </p>
              <h1 className="text-xl font-semibold text-zinc-900 tracking-tight">
                SAC Equipment & Room Register
              </h1>
              <p className="text-xs text-zinc-500 leading-relaxed">
                Sign in with your institute Google account (
                <span className="font-mono text-zinc-700">@iiita.ac.in</span>) or an
                authorized SAC staff email.
              </p>
            </div>

            {error && (
              <div className="mb-5 p-3 rounded-lg bg-red-50 border border-red-200 text-red-700 text-xs flex items-start gap-2">
                <AlertCircle className="w-4 h-4 text-red-600 shrink-0 mt-0.5" />
                <span>{error}</span>
              </div>
            )}

            <div className="py-2 flex flex-col items-center">
              <div className="w-full flex justify-center">
                <GoogleLogin
                  onSuccess={handleGoogleSuccess}
                  onError={handleGoogleError}
                  theme="outline"
                  size="large"
                  text="signin_with"
                  shape="rectangular"
                  width="360"
                />
              </div>

              {isLoading && (
                <div className="flex items-center gap-2 text-xs text-zinc-600 mt-3">
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  <span>Verifying institutional credentials...</span>
                </div>
              )}
            </div>

            <div className="mt-6 pt-5 border-t border-zinc-100 space-y-2 text-[11px] text-zinc-500">
              <div className="flex items-center justify-between">
                <span>Counter pickup TTL</span>
                <span className="font-mono text-zinc-700 tabular-nums">120 seconds</span>
              </div>
              <div className="flex items-center justify-between">
                <span>Peer-to-peer handoffs</span>
                <span className="font-mono text-zinc-700">Atomic batch split</span>
              </div>
              <div className="flex items-center justify-between">
                <span>Room occupancy feed</span>
                <span className="font-mono text-zinc-700">Privacy-redacted</span>
              </div>
            </div>
          </div>

          {/* Discrete Demo Quick-Switch Strip (only visible when ?demo=1 or Ctrl+Shift+D is active) */}
          {demoModeEnabled && onSelectDemoPreset && (
            <div className="bg-white rounded-xl border border-zinc-200 p-4 space-y-2.5">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-zinc-800">
                  Demo Evaluation Accounts
                </span>
                <span className="text-[10px] font-mono text-zinc-400">
                  POST /api/auth/demo-session
                </span>
              </div>
              <div className="grid grid-cols-2 gap-2">
                {PRESET_USERS.map((preset) => (
                  <button
                    key={preset.email}
                    type="button"
                    disabled={isSwitchingDemo}
                    onClick={() => onSelectDemoPreset(preset)}
                    className="px-3 py-2 rounded-lg border border-zinc-200 hover:border-zinc-400 hover:bg-zinc-50 text-left transition disabled:opacity-50"
                  >
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-medium text-zinc-900">
                        {preset.label}
                      </span>
                      <span className="text-[10px] font-mono text-zinc-500">
                        {preset.code}
                      </span>
                    </div>
                    <span className="text-[10px] font-mono text-zinc-500 block truncate">
                      {preset.badge}
                    </span>
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      </main>

      {/* External Staff Whitelist Request Modal */}
      {accessRequest?.isOpen &&
        createPortal(
          <div
            role="dialog"
            aria-modal="true"
            className="fixed inset-0 z-[999] bg-zinc-950/50 backdrop-blur-xs overflow-y-auto flex items-center justify-center p-4"
          >
            <div className="max-w-md w-full bg-white rounded-xl shadow-xl border border-zinc-200 p-6 relative">
              <button
                onClick={() => setAccessRequest(null)}
                className="absolute top-4 right-4 p-1 rounded-md hover:bg-zinc-100 text-zinc-400 hover:text-zinc-700 transition"
                aria-label="Close dialog"
              >
                <X className="w-4 h-4" />
              </button>

              <div className="flex items-start gap-3 mb-5">
                <div className="w-9 h-9 rounded-lg bg-amber-50 border border-amber-200 flex items-center justify-center text-amber-700 shrink-0">
                  <ShieldAlert className="w-4 h-4" />
                </div>
                <div>
                  <h2 className="text-base font-semibold text-zinc-900">
                    External Account Authorization
                  </h2>
                  <p className="text-xs text-zinc-500 mt-0.5 leading-relaxed">
                    <span className="font-mono text-zinc-800">{accessRequest.email}</span>{' '}
                    is outside <span className="font-mono">@iiita.ac.in</span> and requires
                    SAC Administrator approval.
                  </p>
                </div>
              </div>

              {accessRequest.isSubmitted ? (
                <div className="space-y-4">
                  <div className="p-3.5 rounded-lg bg-emerald-50 border border-emerald-200 text-emerald-900 text-xs space-y-1">
                    <div className="flex items-center gap-2 font-semibold">
                      <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                      <span>Access Request Queued</span>
                    </div>
                    <p className="text-emerald-800 leading-relaxed">
                      Your request has been logged for SAC Admin review. Once approved, sign
                      in again with Google.
                    </p>
                  </div>

                  <button
                    type="button"
                    onClick={() => setAccessRequest(null)}
                    className="w-full py-2.5 px-4 rounded-lg bg-zinc-900 hover:bg-zinc-800 text-white font-medium text-xs transition"
                  >
                    Close
                  </button>
                </div>
              ) : (
                <form onSubmit={handleAccessRequestSubmit} className="space-y-3.5">
                  {requestError && (
                    <div className="p-2.5 rounded-lg bg-red-50 border border-red-200 text-red-700 text-xs flex items-start gap-2">
                      <AlertCircle className="w-4 h-4 text-red-600 shrink-0 mt-0.5" />
                      <span>{requestError}</span>
                    </div>
                  )}

                  <div>
                    <label className="block text-xs font-medium text-zinc-700 mb-1">
                      Full Name
                    </label>
                    <input
                      type="text"
                      value={accessRequest.name}
                      onChange={(e) =>
                        setAccessRequest({ ...accessRequest, name: e.target.value })
                      }
                      placeholder="Ramesh Kumar"
                      required
                      className="w-full px-3 py-2 rounded-lg border border-zinc-300 text-xs focus:outline-none focus:border-zinc-900"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-medium text-zinc-700 mb-1">
                      10-Digit Mobile Number
                    </label>
                    <div className="flex items-center rounded-lg border border-zinc-300 bg-white focus-within:border-zinc-900 overflow-hidden">
                      <span className="px-2.5 py-2 bg-zinc-50 border-r border-zinc-200 text-zinc-600 font-mono text-xs select-none">
                        +91
                      </span>
                      <input
                        type="tel"
                        value={requestMobileNo}
                        onChange={(e) =>
                          setRequestMobileNo(e.target.value.replace(/\D/g, '').slice(0, 10))
                        }
                        placeholder="9876543210"
                        maxLength={10}
                        required
                        className="w-full px-3 py-2 text-xs font-mono tabular-nums text-zinc-900 focus:outline-none"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="block text-xs font-medium text-zinc-700 mb-1">
                      Duty Role / Purpose
                    </label>
                    <textarea
                      value={requestReason}
                      onChange={(e) => setRequestReason(e.target.value)}
                      placeholder="SAC Counter Guard (Evening Shift) / Visiting Coach"
                      rows={2}
                      className="w-full px-3 py-2 rounded-lg border border-zinc-300 text-xs focus:outline-none focus:border-zinc-900"
                    />
                  </div>

                  <div className="flex items-center gap-2.5 pt-1">
                    <button
                      type="button"
                      onClick={() => setAccessRequest(null)}
                      className="flex-1 py-2 px-3 rounded-lg border border-zinc-300 hover:bg-zinc-50 text-zinc-700 font-medium text-xs transition"
                    >
                      Cancel
                    </button>
                    <button
                      type="submit"
                      disabled={isSubmittingRequest || requestMobileNo.length < 10}
                      className="flex-1 py-2 px-3 rounded-lg bg-zinc-900 hover:bg-zinc-800 text-white font-medium text-xs transition disabled:opacity-50 flex items-center justify-center gap-1.5"
                    >
                      {isSubmittingRequest ? (
                        <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      ) : (
                        <Send className="w-3.5 h-3.5" />
                      )}
                      <span>Submit Request</span>
                    </button>
                  </div>
                </form>
              )}
            </div>
          </div>,
          document.body
        )}

      <footer className="border-t border-zinc-200 bg-white py-3.5 px-6 text-center text-[11px] text-zinc-500">
        Indian Institute of Information Technology, Allahabad — Student Activity Centre
      </footer>
    </div>
  );
};
