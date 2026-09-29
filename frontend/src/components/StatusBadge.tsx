import React from 'react';
import { AlertTriangle, CheckCircle2, Clock, Radio } from 'lucide-react';

interface StatusBadgeProps {
  status: string;
  delayMins?: number;
  size?: 'sm' | 'md' | 'lg';
  pulse?: boolean;
}

export const StatusBadge: React.FC<StatusBadgeProps> = ({
  status,
  delayMins = 0,
  size = 'md',
  pulse = false,
}) => {
  const isOnTime =
    delayMins <= 5 &&
    (status.toLowerCase().includes('on time') ||
      status.toLowerCase().includes('departed') ||
      delayMins <= 0);
  const isModerateDelay = delayMins > 5 && delayMins <= 20;

  const sizeClasses = {
    sm: 'px-2.5 py-0.5 text-xs gap-1',
    md: 'px-3 py-1 text-xs font-semibold gap-1.5',
    lg: 'px-4 py-1.5 text-sm font-bold gap-2',
  }[size];

  if (isOnTime) {
    return (
      <span
        className={`inline-flex items-center rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200/80 shadow-sm ${sizeClasses}`}
      >
        {pulse ? (
          <span className="h-2 w-2 rounded-full bg-emerald-500 animate-ping" />
        ) : (
          <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
        )}
        <span>{status}</span>
      </span>
    );
  }

  if (isModerateDelay) {
    return (
      <span
        className={`inline-flex items-center rounded-full bg-amber-50 text-amber-800 border border-amber-200/80 shadow-sm ${sizeClasses}`}
      >
        {pulse ? (
          <Radio className="w-3.5 h-3.5 text-amber-600 animate-pulse shrink-0" />
        ) : (
          <Clock className="w-3.5 h-3.5 text-amber-600 shrink-0" />
        )}
        <span>{status}</span>
      </span>
    );
  }

  return (
    <span
      className={`inline-flex items-center rounded-full bg-rose-50 text-rose-700 border border-rose-200/80 shadow-sm ${sizeClasses}`}
    >
      <AlertTriangle className="w-3.5 h-3.5 text-rose-600 shrink-0" />
      <span>{status}</span>
    </span>
  );
};
