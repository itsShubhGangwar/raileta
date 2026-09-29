import React, { useEffect, useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { Database, Filter, RefreshCw, Search, TrainFront } from 'lucide-react';
import { TrainSearchCard } from '../components/TrainSearchCard';
import { TrainCard } from '../components/TrainCard';
import { LoadingState } from '../components/LoadingState';
import { ErrorState } from '../components/ErrorState';
import { searchTrains } from '../services/api';
import { TrainSummary } from '../types/railway';

const TRAIN_TYPES = ['All', 'Rajdhani', 'Vande Bharat', 'Shatabdi', 'Superfast'];
const STATUS_FILTERS = [
  { id: 'all', label: 'All Statuses' },
  { id: 'ontime', label: 'On Time' },
  { id: 'delayed', label: 'Delayed' },
];

export const TrainSearchPage: React.FC = () => {
  const [searchParams, setSearchParams] = useSearchParams();
  const [trains, setTrains] = useState<TrainSummary[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  const [selectedType, setSelectedType] = useState<string>('All');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [originFilter, setOriginFilter] = useState<string>('All');
  const [destinationFilter, setDestinationFilter] = useState<string>('All');

  const qParam = searchParams.get('q') || '';
  const fromParam = searchParams.get('from') || '';
  const toParam = searchParams.get('to') || '';
  const dateParam = searchParams.get('date') || '2026-09-29';

  const loadTrains = async (
    q = qParam,
    from = fromParam,
    to = toParam,
    trainType = selectedType
  ) => {
    setLoading(true);
    setError(null);
    try {
      const data = await searchTrains({
        q,
        from,
        to,
        trainType,
      });
      setTrains(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to search trains');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadTrains(qParam, fromParam, toParam, selectedType);
  }, [qParam, fromParam, toParam, selectedType]);

  const handleCardSearch = (filters: { q: string; from: string; to: string; date: string }) => {
    const nextParams = new URLSearchParams();
    if (filters.q.trim()) nextParams.set('q', filters.q.trim());
    if (filters.from.trim()) nextParams.set('from', filters.from.trim());
    if (filters.to.trim()) nextParams.set('to', filters.to.trim());
    if (filters.date) nextParams.set('date', filters.date);
    setSearchParams(nextParams);
  };

  const handleResetFilters = () => {
    setSelectedType('All');
    setStatusFilter('all');
    setOriginFilter('All');
    setDestinationFilter('All');
    setSearchParams({});
  };

  const origins = useMemo(() => {
    const set = new Set<string>();
    trains.forEach((t) => {
      if (t.source_code) set.add(t.source_code);
    });
    return ['All', ...Array.from(set)];
  }, [trains]);

  const destinations = useMemo(() => {
    const set = new Set<string>();
    trains.forEach((t) => {
      if (t.destination_code) set.add(t.destination_code);
    });
    return ['All', ...Array.from(set)];
  }, [trains]);

  const displayedTrains = trains.filter((t) => {
    if (statusFilter === 'ontime' && t.current_delay_mins > 5) return false;
    if (statusFilter === 'delayed' && t.current_delay_mins <= 5) return false;
    if (originFilter !== 'All' && t.source_code !== originFilter) return false;
    if (destinationFilter !== 'All' && t.destination_code !== destinationFilter) return false;
    return true;
  });

  const hasActiveFilters = Boolean(
    qParam ||
      fromParam ||
      toParam ||
      selectedType !== 'All' ||
      statusFilter !== 'all' ||
      originFilter !== 'All' ||
      destinationFilter !== 'All'
  );

  return (
    <div className="min-h-screen pb-16">
      {/* Top Railway Banner (Section 8) */}
      <div className="relative overflow-hidden bg-[#0B1F3A] text-white pt-12 pb-32">
        <div className="absolute inset-0 z-0">
          <img
            src="/images/railway/station-tracks.jpg"
            alt="Modern Indian railway station platform and tracks"
            loading="eager"
            className="w-full h-full object-cover object-center opacity-55"
            onError={(e) => {
              (e.currentTarget as HTMLImageElement).style.display = 'none';
            }}
          />
          <div className="absolute inset-0 bg-gradient-to-r from-[#0B1F3A]/92 via-[#0F1F3D]/78 to-[#0B1F3A]/45" />
        </div>

        <div className="relative z-10 max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-white/15 border border-white/25 text-white text-xs font-bold mb-3 uppercase tracking-wider">
            <TrainFront className="w-3.5 h-3.5 text-amber-400" />
            Train Search & Live ETA Directory
          </div>
          <h1 className="text-3xl sm:text-5xl font-extrabold tracking-tight drop-shadow-sm">
            Find Your Train
          </h1>
          <p className="text-blue-100 text-sm sm:text-base mt-2 max-w-2xl">
            Search by origin, destination, train number, or train name and inspect real-time
            predicted arrival windows.
          </p>
        </div>
      </div>

      {/* Large Search Bar at Top */}
      <TrainSearchCard
        initialQuery={qParam}
        initialFrom={fromParam}
        initialTo={toParam}
        initialDate={dateParam}
        availableTrains={trains}
        onSearch={handleCardSearch}
        floating
      />

      {/* Filter Bar & Results (Section 17) */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pt-10 space-y-6">
        {/* Filters: Status, Train type, Origin, Destination */}
        <div className="bg-white rounded-2xl p-5 border border-slate-200 shadow-sm space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-4">
            {/* Status Filter */}
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-xs font-bold uppercase tracking-wider text-slate-500 flex items-center gap-1.5 mr-1">
                <Filter className="w-3.5 h-3.5 text-blue-700" />
                Status:
              </span>
              {STATUS_FILTERS.map((sf) => (
                <button
                  key={sf.id}
                  onClick={() => setStatusFilter(sf.id)}
                  className={`px-3.5 py-1.5 rounded-xl text-xs font-bold transition-all ${
                    statusFilter === sf.id
                      ? 'bg-blue-700 text-white shadow-sm'
                      : 'bg-slate-100 text-slate-600 hover:bg-slate-200/70'
                  }`}
                >
                  {sf.label}
                </button>
              ))}
            </div>

            {/* Train Type Filter */}
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-xs font-bold uppercase tracking-wider text-slate-500 mr-1">
                Train Type:
              </span>
              {TRAIN_TYPES.map((type) => (
                <button
                  key={type}
                  onClick={() => setSelectedType(type)}
                  className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all ${
                    selectedType === type
                      ? 'bg-[#0F1F3D] text-white shadow-sm'
                      : 'bg-slate-100 text-slate-600 hover:bg-slate-200/70'
                  }`}
                >
                  {type}
                </button>
              ))}
            </div>
          </div>

          {/* Origin & Destination Dropdown Filters */}
          <div className="pt-3 border-t border-slate-100 flex flex-wrap items-center justify-between gap-4">
            <div className="flex flex-wrap items-center gap-4">
              <div className="flex items-center gap-2">
                <label className="text-xs font-bold uppercase tracking-wider text-slate-500">
                  Origin:
                </label>
                <select
                  value={originFilter}
                  onChange={(e) => setOriginFilter(e.target.value)}
                  className="px-3 py-1.5 rounded-xl border border-slate-200 bg-slate-50 text-xs font-bold text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-600"
                >
                  {origins.map((orig) => (
                    <option key={orig} value={orig}>
                      {orig}
                    </option>
                  ))}
                </select>
              </div>

              <div className="flex items-center gap-2">
                <label className="text-xs font-bold uppercase tracking-wider text-slate-500">
                  Destination:
                </label>
                <select
                  value={destinationFilter}
                  onChange={(e) => setDestinationFilter(e.target.value)}
                  className="px-3 py-1.5 rounded-xl border border-slate-200 bg-slate-50 text-xs font-bold text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-600"
                >
                  {destinations.map((dest) => (
                    <option key={dest} value={dest}>
                      {dest}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            {hasActiveFilters && (
              <button
                onClick={handleResetFilters}
                className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl text-xs font-bold text-rose-700 bg-rose-50 hover:bg-rose-100 border border-rose-200 transition-colors"
              >
                <RefreshCw className="w-3.5 h-3.5" />
                Reset Filters
              </button>
            )}
          </div>
        </div>

        {/* Results Count */}
        <div className="flex items-center justify-between">
          <p className="text-sm font-bold text-slate-700 flex items-center gap-2">
            <TrainFront className="w-4 h-4 text-blue-700" />
            Showing <span className="font-mono text-blue-700">{displayedTrains.length}</span>{' '}
            trains
          </p>
          <span className="text-xs text-slate-500 hidden sm:inline">
            TRAIN NUMBER • TRAIN NAME • FROM → TO • STATUS • SPEED • DELAY • ETA
          </span>
        </div>

        {/* Train Cards List */}
        {loading ? (
          <LoadingState />
        ) : error ? (
          <ErrorState message={error} onRetry={() => loadTrains()} />
        ) : displayedTrains.length === 0 ? (
          <div className="bg-white rounded-3xl p-12 text-center border border-slate-200 shadow-rail-card space-y-4">
            <div className="w-14 h-14 rounded-2xl bg-blue-50 text-blue-700 flex items-center justify-center mx-auto">
              {hasActiveFilters ? (
                <Search className="w-7 h-7" />
              ) : (
                <Database className="w-7 h-7" />
              )}
            </div>
            <h3 className="text-xl font-extrabold text-slate-900">
              {hasActiveFilters
                ? 'No matching trains found for current filters.'
                : 'No train data available.'}
            </h3>
            <p className="text-sm text-slate-500 max-w-md mx-auto">
              {hasActiveFilters
                ? 'Try clearing your search filters or upload additional trains in the Data Center.'
                : 'Upload stations.csv, trains.csv, and routes.csv in the Data Center to search trains and view live ETA predictions.'}
            </p>
            <div className="flex flex-wrap items-center justify-center gap-3 pt-2">
              <Link
                to="/data"
                className="inline-flex items-center gap-2 px-6 py-3 rounded-xl bg-blue-700 hover:bg-blue-800 text-white text-xs sm:text-sm font-extrabold shadow-md transition-colors"
              >
                <Database className="w-4 h-4" />
                OPEN DATA CENTER
              </Link>
              {hasActiveFilters && (
                <button
                  onClick={handleResetFilters}
                  className="px-5 py-3 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-800 text-xs sm:text-sm font-bold transition-colors"
                >
                  Clear Filters
                </button>
              )}
            </div>
          </div>
        ) : (
          <div className="space-y-4">
            {displayedTrains.map((train) => (
              <TrainCard key={train.train_number} train={train} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
};
