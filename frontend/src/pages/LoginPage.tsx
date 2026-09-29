import React, { useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { AlertCircle, CheckCircle2, Lock, TrainFront, User } from 'lucide-react';
import { useAuth } from '../context/AuthContext';

export const LoginPage: React.FC = () => {
  const { login, isAuthenticated, user } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  const [username, setUsername] = useState('demo');
  const [password, setPassword] = useState('RailETA-Demo-2026');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fromPath =
    (location.state as { from?: string } | null)?.from || '/data';

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      await login(username.trim(), password);
      navigate(fromPath, { replace: true });
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : 'Login failed. Verify backend connection and Demo Account credentials.'
      );
    } finally {
      setSubmitting(false);
    }
  };

  const handleFillDemo = () => {
    setUsername('demo');
    setPassword('RailETA-Demo-2026');
    setError(null);
  };

  return (
    <div className="min-h-[calc(100vh-72px)] flex flex-col bg-slate-100 text-slate-800">
      {/* Traditional Railway-Portal Sub-Header Strip with Thin Blue Accent Line */}
      <div className="bg-white border-b-2 border-[#1F3C88] shadow-sm">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-11 flex items-center justify-between text-xs">
          {/* Left: Brand + Portal Links */}
          <div className="flex items-center gap-6 overflow-x-auto">
            <Link
              to="/"
              className="flex items-center gap-1.5 font-bold text-[#1F3C88] tracking-tight shrink-0"
            >
              <TrainFront className="w-4 h-4 text-[#1F3C88]" />
              <span>RAIL ETA</span>
            </Link>

            <nav className="hidden md:flex items-center gap-5 text-slate-700 font-medium">
              <Link to="/" className="hover:text-[#1F3C88] transition-colors">
                Home
              </Link>
              <Link to="/search" className="hover:text-[#1F3C88] transition-colors">
                Train Search
              </Link>
              <Link to="/status" className="hover:text-[#1F3C88] transition-colors">
                Live Status
              </Link>
              <Link to="/details" className="hover:text-[#1F3C88] transition-colors">
                PNR / Journey
              </Link>
              <Link to="/analytics" className="hover:text-[#1F3C88] transition-colors">
                Analytics
              </Link>
            </nav>
          </div>

          {/* Right: About | Help | Login */}
          <div className="flex items-center gap-4 text-slate-700 font-medium shrink-0">
            <Link to="/about" className="hover:text-[#1F3C88] transition-colors">
              About
            </Link>
            <span className="text-slate-300">|</span>
            <Link to="/about" className="hover:text-[#1F3C88] transition-colors">
              Help
            </Link>
            <span className="text-slate-300">|</span>
            <Link to="/login" className="font-bold text-[#1F3C88]">
              Login
            </Link>
          </div>
        </div>
      </div>

      {/* Full-Viewport Realistic Indian Railway Station & Passenger Train Background */}
      <div
        className="relative flex-1 flex flex-col items-center justify-center py-10 px-4 sm:px-6 bg-slate-800 bg-cover bg-center"
        style={{
          backgroundImage: "url('/images/railway/station-tracks.jpg')",
          backgroundSize: 'cover',
          backgroundPosition: 'center',
        }}
      >
        <div className="absolute inset-0 z-0">
          <img
            src="/images/railway/station-tracks.jpg"
            alt="Indian passenger train arriving at railway station platform"
            loading="eager"
            className="w-full h-full object-cover object-center"
            onError={(e) => {
              (e.currentTarget as HTMLImageElement).style.display = 'none';
            }}
          />
          {/* Subtle dark overlay only for readability */}
          <div className="absolute inset-0 bg-black/25" />
        </div>

        {/* Compact Traditional Railway Portal Login Box */}
        <div className="relative z-10 w-full max-w-[380px]">
          <div className="bg-white border border-slate-300 rounded-[6px] shadow-md overflow-hidden">
            {/* Top Railway Blue & Orange/Red Portal Accent Bar */}
            <div className="h-1.5 bg-[#1F3C88] border-b border-[#D9534F]" />

            <div className="p-6 sm:p-7">
              {/* Portal Header */}
              <div className="text-center border-b border-slate-200 pb-4 mb-5">
                <h1 className="text-xl font-bold tracking-wide text-[#1F3C88]">
                  RAIL ETA
                </h1>
                <p className="text-xs text-slate-600 mt-0.5">
                  Predictive Train ETA Platform
                </p>
              </div>

              {isAuthenticated && user ? (
                <div className="space-y-4">
                  <div className="p-3 rounded-[5px] bg-emerald-50 border border-emerald-300 text-emerald-900 text-xs font-semibold flex items-center gap-2">
                    <CheckCircle2 className="w-4 h-4 text-emerald-700 shrink-0" />
                    <span>
                      Signed in as <strong>{user.username}</strong> ({user.account_label})
                    </span>
                  </div>

                  <p className="text-xs text-slate-600 leading-relaxed">
                    Your passenger/operator session is active. Select a portal module below:
                  </p>

                  <div className="space-y-2.5 pt-1">
                    <Link
                      to="/data"
                      className="block w-full text-center py-2.5 px-4 rounded-[5px] bg-[#1F3C88] hover:bg-[#2F55B5] text-white text-xs font-semibold transition-colors"
                    >
                      Open Data Center
                    </Link>
                    <Link
                      to="/demo-control"
                      className="block w-full text-center py-2.5 px-4 rounded-[5px] bg-slate-100 hover:bg-slate-200 text-slate-800 border border-slate-300 text-xs font-semibold transition-colors"
                    >
                      Open Telemetry Control
                    </Link>
                  </div>
                </div>
              ) : (
                <div className="space-y-4">
                  {error && (
                    <div className="p-3 rounded-[5px] bg-red-50 border border-red-300 text-red-800 text-xs font-medium flex items-start gap-2">
                      <AlertCircle className="w-4 h-4 text-red-600 shrink-0 mt-0.5" />
                      <span>{error}</span>
                    </div>
                  )}

                  {/* Practical Login Form */}
                  <form onSubmit={handleSubmit} className="space-y-3.5">
                    <div>
                      <label
                        htmlFor="raileta-username"
                        className="block text-xs font-semibold text-slate-800 mb-1"
                      >
                        Username
                      </label>
                      <div className="relative">
                        <User className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
                        <input
                          id="raileta-username"
                          type="text"
                          required
                          autoComplete="username"
                          value={username}
                          onChange={(e) => setUsername(e.target.value)}
                          placeholder="Enter username"
                          className="w-full pl-9 pr-3 py-2 rounded-[6px] border border-slate-300 bg-white text-sm text-slate-900 focus:outline-none focus:border-[#1F3C88] focus:ring-1 focus:ring-[#1F3C88]"
                        />
                      </div>
                    </div>

                    <div>
                      <label
                        htmlFor="raileta-password"
                        className="block text-xs font-semibold text-slate-800 mb-1"
                      >
                        Password
                      </label>
                      <div className="relative">
                        <Lock className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
                        <input
                          id="raileta-password"
                          type="password"
                          required
                          autoComplete="current-password"
                          value={password}
                          onChange={(e) => setPassword(e.target.value)}
                          placeholder="Enter password"
                          className="w-full pl-9 pr-3 py-2 rounded-[6px] border border-slate-300 bg-white text-sm text-slate-900 focus:outline-none focus:border-[#1F3C88] focus:ring-1 focus:ring-[#1F3C88]"
                        />
                      </div>
                    </div>

                    <div className="pt-1">
                      <button
                        type="submit"
                        disabled={submitting}
                        className="w-full py-2.5 px-4 rounded-[5px] bg-[#1F3C88] hover:bg-[#2F55B5] text-white font-semibold text-sm tracking-wide transition-colors disabled:opacity-60"
                      >
                        {submitting ? 'SIGNING IN...' : 'LOGIN'}
                      </button>
                    </div>
                  </form>

                  {/* Informational Demo Account Panel */}
                  <div className="mt-4 pt-4 border-t border-slate-200">
                    <div className="bg-slate-50 border border-slate-300 rounded-[5px] p-3.5 space-y-2 text-xs">
                      <div className="flex items-center justify-between border-b border-slate-200 pb-1.5">
                        <span className="font-bold text-[#1F3C88] uppercase tracking-wider text-[11px]">
                          DEMO ACCOUNT
                        </span>
                        <span className="text-[11px] text-slate-500">Evaluation Access</span>
                      </div>

                      <div className="space-y-1 text-slate-800 font-mono text-xs pt-0.5">
                        <div>
                          <span className="font-sans font-semibold text-slate-600">Username: </span>
                          <span className="font-bold">demo</span>
                        </div>
                        <div>
                          <span className="font-sans font-semibold text-slate-600">Password: </span>
                          <span className="font-bold">RailETA-Demo-2026</span>
                        </div>
                      </div>

                      <div className="pt-1">
                        <button
                          type="button"
                          onClick={handleFillDemo}
                          className="w-full py-1.5 px-3 rounded-[4px] bg-white hover:bg-[#1F3C88] text-[#1F3C88] hover:text-white border border-[#1F3C88] text-xs font-semibold transition-colors"
                        >
                          Use Demo Credentials
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Subtle Traditional Railway Information Strip Below Login Box */}
          <div className="mt-3 bg-white/95 border border-slate-300 rounded-[5px] px-4 py-2.5 text-center shadow-sm">
            <p className="text-xs font-semibold text-[#1F3C88]">
              RailETA — Predictive Train ETA Platform
            </p>
            <p className="text-[11px] text-slate-600 mt-0.5 font-medium">
              Track • Predict • Arrive
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};
