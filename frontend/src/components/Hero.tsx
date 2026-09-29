import React from 'react';
import { Cpu, Radio } from 'lucide-react';
import { TrainSummary } from '../types/railway';

interface HeroProps {
  featuredTrain?: TrainSummary;
  totalTrains?: number;
  dataSourceLabel?: string;
}

export const Hero: React.FC<HeroProps> = ({ dataSourceLabel }) => {
  const effectiveSourceText =
    dataSourceLabel && dataSourceLabel.toUpperCase().includes('EXTERNAL')
      ? 'External API Configured'
      : 'Prototype • Uploaded Dataset • Manual Telemetry';

  return (
    <section
      className="relative overflow-hidden bg-[#0B1F3A] text-white min-h-[460px] sm:min-h-[520px] lg:min-h-[580px] flex items-center pb-28 sm:pb-32 pt-12 sm:pt-16 bg-cover bg-[68%_center] lg:bg-center"
      style={{ backgroundImage: "url('/images/railway/hero-train.jpg')" }}
    >
      {/* Eager-loaded Modern Blue/White Indian Passenger Train Hero Image */}
      <div className="absolute inset-0 z-0">
        <img
          src="/images/railway/hero-train.jpg"
          alt="Modern blue and white Indian passenger train travelling along electrified railway tracks"
          loading="eager"
          className="w-full h-full object-cover object-[68%_center] lg:object-center"
          onError={(e) => {
            (e.currentTarget as HTMLImageElement).style.display = 'none';
          }}
        />
        {/* Left-darker, Right-lighter Navy/Blue Gradient Overlay so the train remains clearly visible */}
        <div className="absolute inset-0 bg-gradient-to-r from-[#0B1F3A]/92 via-[#0B1F3A]/68 to-[#0B1F3A]/15" />
        <div className="absolute inset-0 bg-gradient-to-t from-[#0B1F3A]/85 via-transparent to-[#0B1F3A]/30" />
      </div>

      <div className="relative z-10 max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 w-full animate-portal-fade">
        <div className="max-w-2xl space-y-5">
          {/* Small Badges */}
          <div className="flex flex-wrap items-center gap-2.5">
            <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-blue-950/85 border border-blue-400/40 text-xs font-bold tracking-wider uppercase text-amber-300 shadow-sm">
              <Cpu className="w-3.5 h-3.5 text-amber-400" />
              AI-POWERED ETA PLATFORM
            </span>
            <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-slate-950/75 border border-slate-600/80 text-xs font-medium text-slate-100 shadow-sm">
              <Radio className="w-3 h-3 text-emerald-400" />
              {effectiveSourceText}
            </span>
          </div>

          {/* Overline */}
          <p className="text-xs sm:text-sm font-extrabold uppercase tracking-[0.2em] text-amber-400 drop-shadow-sm">
            SMARTER TRAIN JOURNEYS
          </p>

          {/* Main Heading */}
          <h1 className="text-4xl sm:text-5xl lg:text-6xl font-extrabold tracking-tight leading-[1.1] text-white drop-shadow-md">
            Know When Your Train
            <span className="block text-blue-200 mt-1">Will Actually Arrive.</span>
          </h1>

          {/* Supporting Text */}
          <p className="text-base sm:text-lg text-slate-100 font-normal max-w-xl leading-relaxed drop-shadow-sm">
            AI-powered train ETA prediction using live telemetry, historical running patterns and
            route conditions.
          </p>
        </div>
      </div>
    </section>
  );
};
