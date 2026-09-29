import React from 'react';
import { Link } from 'react-router-dom';
import { TrainFront } from 'lucide-react';

export const Footer: React.FC = () => {
  return (
    <footer className="bg-[#0B162C] text-slate-300 border-t border-slate-800 mt-20">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-8 pb-8 border-b border-slate-800/80">
          {/* Brand Identity */}
          <div className="space-y-2">
            <Link to="/" className="inline-flex items-center gap-3 group">
              <div className="w-9 h-9 rounded-lg bg-blue-700 flex items-center justify-center text-white relative">
                <TrainFront className="w-5 h-5" />
                <span className="absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 rounded-full bg-amber-400 border-2 border-[#0B162C]" />
              </div>
              <div className="flex items-baseline gap-1">
                <span className="text-lg font-extrabold tracking-tight text-white">RAIL</span>
                <span className="text-lg font-extrabold tracking-tight text-amber-400">ETA</span>
              </div>
            </Link>
            <p className="text-sm text-slate-400 font-medium">
              Intelligent Train ETA Prediction
            </p>
          </div>

          {/* Primary Portal Links */}
          <nav
            className="flex flex-wrap items-center gap-x-7 gap-y-3 text-sm font-medium text-slate-300"
            aria-label="Footer Navigation"
          >
            <Link to="/search" className="hover:text-white transition-colors">
              Train Search
            </Link>
            <Link to="/status" className="hover:text-white transition-colors">
              Live Status
            </Link>
            <Link to="/analytics" className="hover:text-white transition-colors">
              Analytics
            </Link>
            <Link to="/data" className="hover:text-white transition-colors">
              Data Center
            </Link>
            <Link to="/demo-control" className="hover:text-white transition-colors">
              Telemetry Control
            </Link>
            <Link to="/about" className="hover:text-white transition-colors">
              About
            </Link>
          </nav>
        </div>

        <div className="pt-6 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 text-xs text-slate-400">
          <p>
            Prototype platform • Data shown depends on uploaded or configured data sources.
          </p>
          <p className="text-slate-500">
            © {new Date().getFullYear()} RailETA • AI-powered railway ETA intelligence
          </p>
        </div>
      </div>
    </footer>
  );
};
