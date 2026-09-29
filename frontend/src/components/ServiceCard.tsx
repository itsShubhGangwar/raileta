import React from 'react';
import { Link } from 'react-router-dom';
import { ArrowRight, LucideIcon } from 'lucide-react';

interface ServiceCardProps {
  title: string;
  description: string;
  icon: LucideIcon;
  badgeText?: string;
  to: string;
  accentColor?: 'blue' | 'indigo' | 'amber' | 'emerald';
}

export const ServiceCard: React.FC<ServiceCardProps> = ({
  title,
  description,
  icon: Icon,
  badgeText,
  to,
}) => {
  return (
    <Link
      to={to}
      className="group bg-white rounded-2xl p-6 border border-slate-200 hover:border-blue-600/60 shadow-sm hover:shadow-md hover:-translate-y-0.5 transition-all duration-200 flex flex-col justify-between"
    >
      <div>
        <div className="flex items-center justify-between mb-4">
          <div className="w-11 h-11 rounded-xl bg-blue-50 group-hover:bg-blue-700 text-blue-700 group-hover:text-white flex items-center justify-center border border-blue-100 transition-colors">
            <Icon className="w-5 h-5" />
          </div>
          {badgeText && (
            <span className="text-[11px] font-semibold uppercase tracking-wider px-2.5 py-0.5 rounded-md bg-slate-100 text-slate-600">
              {badgeText}
            </span>
          )}
        </div>

        <h3 className="text-base sm:text-lg font-bold text-[#0F1F3D] group-hover:text-blue-700 transition-colors">
          {title}
        </h3>
        <p className="text-sm text-slate-600 leading-relaxed mt-1.5">{description}</p>
      </div>

      <div className="mt-5 pt-3.5 border-t border-slate-100 flex items-center justify-between text-xs font-bold text-blue-700">
        <span>Open Service</span>
        <ArrowRight className="w-4 h-4 group-hover:translate-x-0.5 transition-transform" />
      </div>
    </Link>
  );
};
