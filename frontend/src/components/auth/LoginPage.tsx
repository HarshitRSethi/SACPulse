import React, { useState } from 'react';
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
  ChevronRight
} from 'lucide-react';

interface LoginPageProps {
  onLoginSuccess: (user: User, token: string, requiresMobileSetup: boolean) => void;
}

export const LoginPage: React.FC<LoginPageProps> = ({ onLoginSuccess }) => {
  const [isLoading, setIsLoading] = useState(false);
  const [loadingPreset, setLoadingPreset] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

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
      setError(err.message || 'Google authentication failed. Please verify your college account.');
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
      setError(err.message || 'Login failed. Please verify your email credentials.');
    } finally {
      setIsLoading(false);
      setLoadingPreset(null);
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

      {/* Footer */}
      <footer className="border-t border-zinc-200 bg-white py-4 px-6 text-center text-xs text-zinc-400 font-mono">
        IIITA Student Activity Centre (SAC) • Real-Time Digital Register & Equipment Pulse
      </footer>
    </div>
  );
};
