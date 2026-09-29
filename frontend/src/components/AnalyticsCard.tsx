import React from 'react';
import { LucideIcon } from 'lucide-react';

interface AnalyticsCardProps {
  title: string;
  subtitle: string;
  badge: string;
  icon: LucideIcon;
  footerInsight?: string;
  children: React.ReactNode;
}

export const AnalyticsCard: React.FC<AnalyticsCardProps> = ({
  title,
  subtitle,
  badge,
  icon: Icon,
  footerInsight,
  children,
}) => {
  return (
    <div className="bg-white rounded-3xl border border-slate-200/90 shadow-rail-card p-6 sm:p-7 flex flex-col justify-between">
      <div>
        <div className="flex items-start justify-between gap-4 pb-5 mb-5 border-b border-slate-100">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-blue-900 text-white flex items-center justify-center shadow-sm shrink-0">
              <Icon className="w-5 h-5 text-amber-400" />
            </div>
            <div>
              <h3 className="text-base sm:text-lg font-extrabold text-slate-900">{title}</h3>
              <p className="text-xs text-slate-500 mt-0.5">{subtitle}</p>
            </div>
          </div>
          <span className="px-2.5 py-1 rounded-full bg-indigo-50 text-indigo-800 border border-indigo-200/70 text-[11px] font-bold whitespace-nowrap">
            {badge}
          </span>
        </div>

        <div className="w-full h-72">{children}</div>
      </div>

      {footerInsight && (
        <div className="mt-5 pt-4 border-t border-slate-100 text-xs text-slate-600 flex items-center justify-between">
          <span>{footerInsight}</span>
          <span className="font-mono font-bold text-blue-900">RailETA ML v1.2</span>
        </div>
      )}
    </div>
  );
};
