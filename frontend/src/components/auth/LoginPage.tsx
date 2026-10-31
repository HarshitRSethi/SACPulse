import React, { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { GoogleLogin, type CredentialResponse } from '@react-oauth/google';
import type { User } from '../../types/index';
import { api } from '../../services/api';
import {
  Clock,
  ArrowRightLeft,
  DoorOpen,
  AlertTriangle,
  Loader2,
  AlertCircle,
  Sparkles,
  ShieldCheck,
  ChevronRight,
  ShieldAlert,
  CheckCircle2,
  X,
  Send
} from 'lucide-react';

interface LoginPageProps {
  onLoginSuccess: (user: User, token: string, requiresMobileSetup: boolean) => void;
}

export const LoginPage: React.FC<LoginPageProps> = ({ onLoginSuccess }) => {
  const [isLoading, setIsLoading] = useState(false);
  const [loadingPreset, setLoadingPreset] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Access Request Modal State for unwhitelisted non-IIITA accounts
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

  // Scroll lock when access request modal is open
  useEffect(() => {
    if (accessRequest?.isOpen) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
    }
    return () => {
      document.body.style.overflow = '';
    };
  }, [accessRequest?.isOpen]);

  // Official Google OAuth Sign-In handler
  const handleGoogleSuccess = async (response: CredentialResponse) => {
    if (!response.credential) {
      setError('Google Sign-In failed: No credential token received.');
      return;
    }

    try {
      setIsLoading(true);
      setError(null);
      const res = await api.loginWithGoogle({ credential: response.credential });

      // Store in localStorage
      api.setStoredAuth(res.token, res.user);

      // Invoke callback: updates state, checks requiresMobileSetup & routes by role
      onLoginSuccess(res.user, res.token, res.requiresMobileSetup);
    } catch (err: any) {
      console.error('Google Sign-In error:', err);
      // Catch access restriction for unwhitelisted non-IIITA emails
      if (err.code === 'ACCESS_RESTRICTED' || err.message?.includes('Access restricted')) {
        const email = err.userEmail || '';
        const name = err.userName || '';
        const isAlreadyPending = err.whitelistStatus === 'PENDING';
        setAccessRequest({
          isOpen: true,
          email,
          name,
          isSubmitted: isAlreadyPending,
          status: err.whitelistStatus
        });
        setRequestMobileNo('');
        setRequestReason('');
        setError(null);
      } else {
        setError(err.message || 'Google authentication failed. Please verify your college account.');
      }
    } finally {
      setIsLoading(false);
    }
  };

  const handleGoogleError = () => {
    setError('Google Sign-In was cancelled or failed. Please try again.');
  };

  // 1-tap login for dev testing & presets
  const performLogin = async (email: string, name?: string, presetKey?: string) => {
    try {
      setIsLoading(true);
      setError(null);
      if (presetKey) setLoadingPreset(presetKey);

      const res = await api.loginWithGoogle(email.trim(), name?.trim());

      // Store in localStorage
      api.setStoredAuth(res.token, res.user);

      // Invoke callback
      onLoginSuccess(res.user, res.token, res.requiresMobileSetup);
    } catch (err: any) {
      console.error('Login error:', err);
      if (err.code === 'ACCESS_RESTRICTED' || err.message?.includes('Access restricted')) {
        setAccessRequest({
          isOpen: true,
          email,
          name: name || '',
          isSubmitted: err.whitelistStatus === 'PENDING',
          status: err.whitelistStatus
        });
        setRequestMobileNo('');
        setRequestReason('');
        setError(null);
      } else {
        setError(err.message || 'Login failed. Please verify your email credentials.');
      }
    } finally {
      setIsLoading(false);
      setLoadingPreset(null);
    }
  };

  const handleAccessRequestSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!accessRequest) return;

    const cleanMobile = requestMobileNo.trim();
    if (!/^[6-9]\d{9}$/.test(cleanMobile)) {
      setRequestError('Please enter a valid 10-digit Indian calling number starting with 6, 7, 8, or 9.');
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
      setAccessRequest({
        ...accessRequest,
        isSubmitted: true
      });
    } catch (err: any) {
      console.error('Failed to submit access request:', err);
      setRequestError(err.message || 'Failed to submit access request. Please try again.');
    } finally {
      setIsSubmittingRequest(false);
    }
  };

  const devPresets = [
    {
      key: 'student_a',
      name: 'Student A (Rohan)',
      email: 'studenta@iiita.ac.in',
      rollNo: 'IIT2023001',
      avatar: '👨‍🎓',
      roleBadge: 'Primary Student',
      desc: 'Can request gear, initiate transfers & checkout rooms'
    },
    {
      key: 'student_b',
      name: 'Student B (Priya)',
      email: 'studentb@iiita.ac.in',
      rollNo: 'IIT2023002',
      avatar: '👩‍🎓',
      roleBadge: 'Transfer Peer',
      desc: 'Accepts incoming peer transfers & browses stock'
    },
    {
      key: 'guard',
      name: 'SAC Guard Ramesh',
      email: 'guard.sac.iiita@gmail.com',
      rollNo: 'STAFF-DESK-1',
      avatar: '👮‍♂️',
      roleBadge: 'Guard Desk',
      desc: 'Approves 2-min counter requests & logs returns'
    },
    {
      key: 'admin',
      name: 'SAC Admin Dr. Sharma',
      email: 'admin@iiita.ac.in',
      rollNo: 'FACULTY-SAC',
      avatar: '🏛️',
      roleBadge: 'SAC Admin',
      desc: 'Full digital register oversight, inventory & penalties'
    }
  ];

  return (
    <div className="min-h-screen bg-[#FAFAFB] text-zinc-900 selection:bg-blue-600 selection:text-white flex flex-col justify-between">
      {/* Top Header */}
      <header className="border-b border-zinc-200 bg-white/80 backdrop-blur-md px-6 py-4 sticky top-0 z-10">
        <div className="max-w-6xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-blue-600 font-black text-white text-base shadow-sm shadow-blue-500/25">
              ⚡
            </span>
            <div className="flex items-center gap-2">
              <span className="text-lg font-black tracking-tight text-zinc-900">
                SACPulse
              </span>
              <span className="text-[10px] uppercase font-mono font-bold px-2 py-0.5 rounded-full bg-blue-50 text-blue-700 border border-blue-200">
                IIITA
              </span>
            </div>
          </div>
          <span className="text-xs text-zinc-400 font-mono hidden sm:inline">
            SAC Counter & Activity Engine v1.0
          </span>
        </div>
      </header>

      {/* Main Container */}
      <main className="flex-1 max-w-6xl w-full mx-auto px-4 py-8 sm:py-12 flex flex-col justify-center">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
          
          {/* Left Column: Branding & Counter Rules */}
          <div className="lg:col-span-6 space-y-6">
            <div className="space-y-3">
              <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-blue-50 text-blue-700 border border-blue-200 text-xs font-semibold">
                <Sparkles className="w-3.5 h-3.5 text-blue-600" />
                IIITA Student Activity Centre Portal
              </div>
              <h1 className="text-3xl sm:text-4xl font-black text-zinc-900 tracking-tight leading-tight">
                Digital Register & Equipment Pulse
              </h1>
              <p className="text-sm sm:text-base text-zinc-600 leading-relaxed">
                Seamless SAC sports gear checkouts, real-time activity room occupancy, and atomic peer-to-peer transfers with zero paper logs.
              </p>
            </div>

            {/* IIITA SAC Counter Rules Card */}
            <div className="bg-white rounded-3xl p-6 border border-zinc-200/90 shadow-sm space-y-4">
              <h2 className="text-xs font-bold uppercase tracking-wider text-zinc-400 flex items-center gap-2">
                <ShieldCheck className="w-4 h-4 text-blue-600" />
                Counter Rules & State Policies
              </h2>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="p-3.5 rounded-2xl bg-zinc-50 border border-zinc-200/70">
                  <div className="flex items-center gap-2 text-zinc-900 font-bold text-xs mb-1">
                    <Clock className="w-4 h-4 text-amber-500" />
                    2-Min Pickup Window
                  </div>
                  <p className="text-[11px] text-zinc-500 leading-relaxed">
                    Counter requests expire in 120s server time. First to reach the counter collects the stock.
                  </p>
                </div>

                <div className="p-3.5 rounded-2xl bg-zinc-50 border border-zinc-200/70">
                  <div className="flex items-center gap-2 text-zinc-900 font-bold text-xs mb-1">
                    <ArrowRightLeft className="w-4 h-4 text-blue-500" />
                    P2P Atomic Transfers
                  </div>
                  <p className="text-[11px] text-zinc-500 leading-relaxed">
                    Pass equipment directly to eligible peers. Register logs swap automatically without counter trips.
                  </p>
                </div>

                <div className="p-3.5 rounded-2xl bg-zinc-50 border border-zinc-200/70">
                  <div className="flex items-center gap-2 text-zinc-900 font-bold text-xs mb-1">
                    <DoorOpen className="w-4 h-4 text-emerald-500" />
                    Privacy-Safe Rooms
                  </div>
                  <p className="text-[11px] text-zinc-500 leading-relaxed">
                    Live room occupancy statuses show &ldquo;Occupied since [Time]&rdquo; without revealing student identities.
                  </p>
                </div>

                <div className="p-3.5 rounded-2xl bg-zinc-50 border border-zinc-200/70">
                  <div className="flex items-center gap-2 text-zinc-900 font-bold text-xs mb-1">
                    <AlertTriangle className="w-4 h-4 text-red-500" />
                    Defaulter Protection
                  </div>
                  <p className="text-[11px] text-zinc-500 leading-relaxed">
                    &gt;3 timeouts in 1 hour trigger a 5h cooldown. Damaged equipment locks account until admin review.
                  </p>
                </div>
              </div>
            </div>
          </div>

          {/* Right Column: Google Sign In Card & Dev Dock */}
          <div className="lg:col-span-6 space-y-6">
            
            {/* Primary Google Login Card */}
            <div className="bg-white rounded-3xl p-6 sm:p-7 border border-zinc-200/90 shadow-md relative overflow-hidden">
              <div className="mb-5">
                <span className="text-[11px] font-mono font-bold tracking-wider uppercase text-blue-600 bg-blue-50 px-2 py-0.5 rounded-md border border-blue-100 inline-block mb-1">
                  Google Authentication
                </span>
                <h2 className="text-xl font-extrabold text-zinc-900 tracking-tight">
                  Sign In to SACPulse
                </h2>
                <p className="text-xs text-zinc-500 mt-1 leading-relaxed">
                  Log in using your official IIITA Google account (<span className="font-mono text-zinc-700">@iiita.ac.in</span>) or whitelisted staff email.
                </p>
              </div>

              {/* Error banner */}
              {error && (
                <div className="mb-5 p-3.5 rounded-2xl bg-red-50 border border-red-200 text-red-700 text-xs flex items-start gap-2.5 animate-in slide-in-from-top-1">
                  <AlertCircle className="w-4 h-4 text-red-600 shrink-0 mt-0.5" />
                  <span className="leading-snug">{error}</span>
                </div>
              )}

              {/* Official Google Login Component */}
              <div className="flex flex-col items-center justify-center gap-3 py-3">
                <div className="w-full flex justify-center">
                  <GoogleLogin
                    onSuccess={handleGoogleSuccess}
                    onError={handleGoogleError}
                    theme="outline"
                    size="large"
                    text="signin_with"
                    shape="rectangular"
                    width="100%"
                  />
                </div>

                {isLoading && !loadingPreset && (
                  <div className="flex items-center gap-2 text-xs font-semibold text-blue-600 mt-2">
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    <span>Verifying Google token with IIITA server...</span>
                  </div>
                )}
              </div>
            </div>

            {/* Dev Quick-Login Section */}
            <div className="bg-white rounded-3xl p-6 border border-zinc-200/90 shadow-sm space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-xs font-extrabold uppercase tracking-wider text-zinc-800 flex items-center gap-1.5">
                    <span>🛠️</span> Dev Quick-Login Selector
                  </h3>
                  <p className="text-[11px] text-zinc-500 mt-0.5">
                    Instantly simulate student, guard, and admin scenarios with 1-tap.
                  </p>
                </div>
                <span className="text-[10px] font-mono px-2 py-0.5 rounded-md bg-purple-50 text-purple-700 border border-purple-200">
                  Local Testing
                </span>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {devPresets.map((preset) => {
                  const isCurrentLoading = isLoading && loadingPreset === preset.key;
                  return (
                    <button
                      key={preset.key}
                      onClick={() => performLogin(preset.email, preset.name, preset.key)}
                      disabled={isLoading}
                      className="group p-3.5 rounded-2xl border border-zinc-200 hover:border-zinc-300 bg-zinc-50/70 hover:bg-white text-left transition-all duration-150 hover:shadow-sm flex flex-col justify-between disabled:opacity-50"
                    >
                      <div className="flex items-start justify-between gap-2 mb-2">
                        <div className="flex items-center gap-2">
                          <span className="text-xl">{preset.avatar}</span>
                          <div>
                            <span className="font-bold text-xs text-zinc-900 group-hover:text-blue-600 transition block">
                              {preset.name}
                            </span>
                            <span className="text-[10px] text-zinc-500 font-mono block">
                              {preset.rollNo}
                            </span>
                          </div>
                        </div>
                        {isCurrentLoading ? (
                          <Loader2 className="w-4 h-4 animate-spin text-blue-600" />
                        ) : (
                          <ChevronRight className="w-4 h-4 text-zinc-400 group-hover:text-zinc-600 group-hover:translate-x-0.5 transition" />
                        )}
                      </div>
                      <div className="flex items-center justify-between mt-1 pt-2 border-t border-zinc-200/60 text-[10px]">
                        <span className="px-1.5 py-0.5 rounded bg-zinc-200/70 font-mono font-semibold text-zinc-700">
                          {preset.roleBadge}
                        </span>
                        <span className="text-zinc-400 font-mono text-[9px] truncate max-w-[120px]">
                          {preset.email.split('@')[0]}
                        </span>
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>

          </div>
        </div>
      </main>

      {/* Access Restricted / Whitelist Request Modal */}
      {accessRequest?.isOpen &&
        createPortal(
          <div
            role="dialog"
            aria-modal="true"
            className="fixed inset-0 z-[999] bg-zinc-950/75 backdrop-blur-md overflow-y-auto flex items-center justify-center p-4 animate-in fade-in duration-200"
          >
            <div className="max-w-md w-full bg-white rounded-3xl shadow-2xl border border-zinc-200 p-6 sm:p-7 relative overflow-hidden transition-all">
              {/* Decorative top bar */}
              <div className="absolute top-0 left-0 right-0 h-1.5 bg-gradient-to-r from-amber-500 via-orange-500 to-amber-600" />

              {/* Close Button */}
              <button
                onClick={() => setAccessRequest(null)}
                className="absolute top-4 right-4 p-1.5 rounded-full hover:bg-zinc-100 text-zinc-400 hover:text-zinc-600 transition"
              >
                <X className="w-4 h-4" />
              </button>

              {/* Header */}
              <div className="flex items-start gap-4 mb-5">
                <div className="w-12 h-12 rounded-2xl bg-amber-50 border border-amber-200 flex items-center justify-center text-amber-600 shrink-0 shadow-sm">
                  <ShieldAlert className="w-6 h-6" />
                </div>
                <div>
                  <span className="text-[11px] font-mono font-bold tracking-wider uppercase text-amber-700 bg-amber-50 px-2 py-0.5 rounded-md border border-amber-200 inline-block mb-1">
                    Access Restricted
                  </span>
                  <h2 className="text-xl font-extrabold text-zinc-900 tracking-tight">
                    Account Not Authorized
                  </h2>
                  <p className="text-xs text-zinc-500 mt-1 leading-relaxed">
                    <strong className="text-zinc-800">{accessRequest.email}</strong> is not authorized yet. Non-IIITA college emails require SAC Admin approval.
                  </p>
                </div>
              </div>

              {/* Submitted Confirmation State */}
              {accessRequest.isSubmitted ? (
                <div className="space-y-4">
                  <div className="p-4 rounded-2xl bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs space-y-2">
                    <div className="flex items-center gap-2 font-bold text-sm text-emerald-900">
                      <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0" />
                      Request Under Review
                    </div>
                    <p className="leading-relaxed">
                      Your request has been submitted to the SAC Admin for review. Once approved, you can sign in with your Google account.
                    </p>
                  </div>

                  <button
                    type="button"
                    onClick={() => setAccessRequest(null)}
                    className="w-full py-3 px-4 rounded-2xl bg-zinc-900 hover:bg-black text-white font-bold text-xs shadow transition"
                  >
                    Close Window
                  </button>
                </div>
              ) : (
                /* Access Request Form */
                <form onSubmit={handleAccessRequestSubmit} className="space-y-4">
                  {requestError && (
                    <div className="p-3 rounded-2xl bg-red-50 border border-red-200 text-red-700 text-xs flex items-start gap-2">
                      <AlertCircle className="w-4 h-4 text-red-600 shrink-0 mt-0.5" />
                      <span>{requestError}</span>
                    </div>
                  )}

                  <div>
                    <label className="block text-xs font-bold text-zinc-700 uppercase tracking-wider mb-1">
                      Full Name
                    </label>
                    <input
                      type="text"
                      value={accessRequest.name}
                      onChange={(e) =>
                        setAccessRequest({ ...accessRequest, name: e.target.value })
                      }
                      placeholder="e.g. Ramesh Guard / Guest Student"
                      required
                      className="w-full px-3.5 py-2.5 rounded-xl border border-zinc-300 text-xs focus:outline-none focus:ring-2 focus:ring-amber-500"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-zinc-700 uppercase tracking-wider mb-1">
                      10-Digit Calling Number
                    </label>
                    <div className="flex items-center rounded-xl border border-zinc-300 bg-white focus-within:border-amber-600 focus-within:ring-2 focus-within:ring-amber-100 overflow-hidden shadow-xs">
                      <span className="px-3 py-2.5 bg-zinc-100 border-r border-zinc-200 text-zinc-700 font-mono font-bold text-xs select-none">
                        +91
                      </span>
                      <input
                        type="tel"
                        value={requestMobileNo}
                        onChange={(e) =>
                          setRequestMobileNo(
                            e.target.value.replace(/\D/g, '').slice(0, 10)
                          )
                        }
                        placeholder="9876543210"
                        maxLength={10}
                        required
                        className="w-full px-3 py-2 text-sm font-mono font-semibold text-zinc-900 focus:outline-none"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-zinc-700 uppercase tracking-wider mb-1">
                      Role / Reason for Access
                    </label>
                    <textarea
                      value={requestReason}
                      onChange={(e) => setRequestReason(e.target.value)}
                      placeholder="e.g. SAC Guard (Night Shift Desk), Visiting Exchange Student, etc."
                      rows={2}
                      className="w-full px-3.5 py-2.5 rounded-xl border border-zinc-300 text-xs focus:outline-none focus:ring-2 focus:ring-amber-500"
                    />
                  </div>

                  <div className="flex items-center gap-3 pt-2">
                    <button
                      type="button"
                      onClick={() => setAccessRequest(null)}
                      className="flex-1 py-3 px-4 rounded-2xl border border-zinc-300 hover:bg-zinc-100 text-zinc-700 font-bold text-xs transition"
                    >
                      Cancel
                    </button>
                    <button
                      type="submit"
                      disabled={isSubmittingRequest || requestMobileNo.length < 10}
                      className="flex-1 py-3 px-4 rounded-2xl bg-amber-600 hover:bg-amber-700 text-white font-bold text-xs shadow-md transition disabled:opacity-50 flex items-center justify-center gap-1.5"
                    >
                      {isSubmittingRequest ? (
                        <Loader2 className="w-3.5 h-3.5 animate-spin text-white" />
                      ) : (
                        <Send className="w-3.5 h-3.5 text-white" />
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

      {/* Footer */}
      <footer className="border-t border-zinc-200 bg-white py-4 px-6 text-center text-xs text-zinc-400 font-mono">
        IIITA Student Activity Centre (SAC) • Real-Time Digital Register & Equipment Pulse
      </footer>
    </div>
  );
};
