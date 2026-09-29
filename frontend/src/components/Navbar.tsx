import React, { useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import {
  Activity,
  BarChart3,
  ChevronDown,
  Compass,
  Database,
  Info,
  LogIn,
  LogOut,
  Menu,
  Search,
  Sliders,
  TrainFront,
  UserCheck,
  X,
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';

export const Navbar: React.FC = () => {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [accountMenuOpen, setAccountMenuOpen] = useState(false);

  const { user, isAuthenticated, logout } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();

  const primaryNavItems = [
    { label: 'Home', path: '/', icon: Compass },
    { label: 'Train Search', path: '/search', icon: Search },
    { label: 'Live Status', path: '/status', icon: Activity },
    { label: 'Analytics', path: '/analytics', icon: BarChart3 },
    { label: 'Data Center', path: '/data', icon: Database },
  ];

  const isActive = (path: string) => {
    if (path === '/') return location.pathname === '/';
    if (path === '/status') {
      return location.pathname.startsWith('/status') || location.pathname.startsWith('/details');
    }
    return location.pathname.startsWith(path);
  };

  const handleLogout = async () => {
    await logout();
    setMobileMenuOpen(false);
    setAccountMenuOpen(false);
    navigate('/login');
  };

  return (
    <header className="sticky top-0 z-50 bg-white border-b border-slate-200/90 shadow-sm">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-[72px]">
          {/* LEFT: Original RailETA Logo / Wordmark + Primary Navigation */}
          <div className="flex items-center gap-8">
            <Link
              to="/"
              className="flex items-center gap-3 group shrink-0"
              aria-label="RailETA Home"
            >
              <div className="w-10 h-10 rounded-xl bg-[#0F1F3D] flex items-center justify-center text-white shadow-sm group-hover:bg-blue-800 transition-colors relative">
                <TrainFront className="w-5 h-5 text-white" />
                <span className="absolute -bottom-0.5 -right-0.5 w-3 h-3 rounded-full bg-amber-400 border-2 border-white" />
              </div>
              <div className="flex flex-col leading-none">
                <div className="flex items-baseline gap-1">
                  <span className="text-lg font-extrabold tracking-tight text-[#0F1F3D]">
                    RAIL
                  </span>
                  <span className="text-lg font-extrabold tracking-tight text-blue-700">
                    ETA
                  </span>
                </div>
                <span className="text-[10px] font-semibold uppercase tracking-widest text-slate-500 mt-0.5">
                  Railway ETA Portal
                </span>
              </div>
            </Link>

            {/* CENTER / LEFT: Desktop Navigation */}
            <nav className="hidden lg:flex items-center h-[72px] gap-1" aria-label="Main Navigation">
              {primaryNavItems.map((item) => {
                const Icon = item.icon;
                const active = isActive(item.path);
                return (
                  <Link
                    key={item.label}
                    to={item.path}
                    className={`relative h-full inline-flex items-center gap-2 px-3.5 text-sm font-semibold transition-colors ${
                      active
                        ? 'text-blue-700'
                        : 'text-slate-700 hover:text-[#0F1F3D]'
                    }`}
                  >
                    <Icon
                      className={`w-4 h-4 ${
                        active ? 'text-blue-700' : 'text-slate-400'
                      }`}
                    />
                    <span>{item.label}</span>
                    {active && (
                      <span className="absolute bottom-0 left-3 right-3 h-[3px] bg-blue-700 rounded-t-full" />
                    )}
                  </Link>
                );
              })}
            </nav>
          </div>

          {/* RIGHT: Demo Control, About, Login / User Indicator */}
          <div className="hidden lg:flex items-center gap-2">
            <Link
              to="/demo-control"
              className={`inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg text-sm font-semibold transition-colors ${
                location.pathname.startsWith('/demo-control')
                  ? 'bg-blue-50 text-blue-700'
                  : 'text-slate-700 hover:bg-slate-100 hover:text-[#0F1F3D]'
              }`}
            >
              <Sliders className="w-4 h-4 text-amber-500" />
              <span>Demo Control</span>
            </Link>

            <Link
              to="/about"
              className={`inline-flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-semibold transition-colors ${
                location.pathname.startsWith('/about')
                  ? 'bg-blue-50 text-blue-700'
                  : 'text-slate-700 hover:bg-slate-100 hover:text-[#0F1F3D]'
              }`}
            >
              <Info className="w-4 h-4 text-slate-400" />
              <span>About</span>
            </Link>

            <div className="h-5 w-px bg-slate-200 mx-1.5" />

            {isAuthenticated && user ? (
              <div className="relative">
                <button
                  type="button"
                  onClick={() => setAccountMenuOpen(!accountMenuOpen)}
                  className="inline-flex items-center gap-2 px-3.5 py-2 rounded-lg bg-slate-50 hover:bg-slate-100 border border-slate-200 text-xs font-bold text-[#0F1F3D] transition-colors"
                >
                  <span className="w-2 h-2 rounded-full bg-emerald-500" />
                  <UserCheck className="w-3.5 h-3.5 text-blue-700" />
                  <span>{user.account_label || 'Demo Account'}</span>
                  <ChevronDown className="w-3.5 h-3.5 text-slate-500" />
                </button>

                {accountMenuOpen && (
                  <div className="absolute right-0 mt-2 w-60 rounded-xl bg-white border border-slate-200 shadow-lg p-2 z-50">
                    <div className="px-3 py-2 border-b border-slate-100">
                      <p className="text-[11px] font-bold uppercase tracking-wider text-blue-700">
                        {user.account_label || 'Demo Account'}
                      </p>
                      <p className="text-xs font-mono text-slate-600 mt-0.5">
                        User: {user.username}
                      </p>
                    </div>
                    <div className="py-1 space-y-0.5">
                      <Link
                        to="/data"
                        onClick={() => setAccountMenuOpen(false)}
                        className="flex items-center gap-2 px-3 py-2 rounded-lg text-xs font-semibold text-slate-700 hover:bg-slate-50 hover:text-blue-700"
                      >
                        <Database className="w-3.5 h-3.5 text-blue-700" />
                        Data Center
                      </Link>
                      <Link
                        to="/demo-control"
                        onClick={() => setAccountMenuOpen(false)}
                        className="flex items-center gap-2 px-3 py-2 rounded-lg text-xs font-semibold text-slate-700 hover:bg-slate-50 hover:text-blue-700"
                      >
                        <Sliders className="w-3.5 h-3.5 text-amber-500" />
                        Telemetry Control
                      </Link>
                      <button
                        type="button"
                        onClick={handleLogout}
                        className="w-full flex items-center gap-2 px-3 py-2 rounded-lg text-xs font-semibold text-rose-600 hover:bg-rose-50"
                      >
                        <LogOut className="w-3.5 h-3.5" />
                        Sign Out
                      </button>
                    </div>
                  </div>
                )}
              </div>
            ) : (
              <Link
                to="/login"
                className="inline-flex items-center gap-2 px-4 py-2.5 rounded-lg bg-blue-700 hover:bg-blue-800 text-white text-sm font-semibold shadow-sm transition-colors"
              >
                <LogIn className="w-4 h-4" />
                <span>Login</span>
              </Link>
            )}
          </div>

          {/* Mobile Menu Trigger */}
          <div className="flex items-center gap-2 lg:hidden">
            {isAuthenticated && user ? (
              <Link
                to="/data"
                className="px-2.5 py-1.5 rounded-lg bg-blue-50 text-blue-700 border border-blue-200 text-xs font-bold"
              >
                Demo Account
              </Link>
            ) : (
              <Link
                to="/login"
                className="px-3 py-1.5 rounded-lg bg-blue-700 text-white text-xs font-bold"
              >
                Login
              </Link>
            )}
            <button
              type="button"
              onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
              className="p-2 rounded-lg text-slate-700 hover:bg-slate-100 focus:outline-none"
              aria-label="Toggle Navigation Menu"
            >
              {mobileMenuOpen ? <X className="w-6 h-6" /> : <Menu className="w-6 h-6" />}
            </button>
          </div>
        </div>
      </div>

      {/* Mobile Navigation Drawer */}
      {mobileMenuOpen && (
        <div className="lg:hidden bg-white border-t border-slate-200 px-4 pt-3 pb-5 space-y-1 shadow-lg">
          {[
            ...primaryNavItems,
            { label: 'Demo Control', path: '/demo-control', icon: Sliders },
            { label: 'About', path: '/about', icon: Info },
          ].map((item) => {
            const Icon = item.icon;
            const active = isActive(item.path);
            return (
              <Link
                key={item.label}
                to={item.path}
                onClick={() => setMobileMenuOpen(false)}
                className={`flex items-center gap-3 px-3.5 py-2.5 rounded-lg text-sm font-semibold transition-colors ${
                  active
                    ? 'bg-blue-50 text-blue-700'
                    : 'text-slate-700 hover:bg-slate-50'
                }`}
              >
                <Icon className={`w-4 h-4 ${active ? 'text-blue-700' : 'text-slate-400'}`} />
                <span>{item.label}</span>
              </Link>
            );
          })}

          <div className="pt-3 mt-2 border-t border-slate-100">
            {isAuthenticated && user ? (
              <div className="flex items-center justify-between px-3.5 py-2">
                <span className="text-xs font-semibold text-slate-600">
                  Signed in as <strong className="text-[#0F1F3D]">{user.username}</strong> (Demo Account)
                </span>
                <button
                  type="button"
                  onClick={handleLogout}
                  className="text-xs font-bold text-rose-600 hover:text-rose-700 inline-flex items-center gap-1"
                >
                  <LogOut className="w-3.5 h-3.5" />
                  Sign Out
                </button>
              </div>
            ) : (
              <Link
                to="/login"
                onClick={() => setMobileMenuOpen(false)}
                className="w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg bg-blue-700 text-white text-sm font-semibold"
              >
                <LogIn className="w-4 h-4" />
                Sign In to Demo Account
              </Link>
            )}
          </div>
        </div>
      )}
    </header>
  );
};
