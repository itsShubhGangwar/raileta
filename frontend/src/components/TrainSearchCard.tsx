import React, { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  Activity,
  ArrowRightLeft,
  Calendar,
  Cpu,
  Database,
  MapPin,
  Search,
  TrainFront,
} from 'lucide-react';
import { searchTrains } from '../services/api';
import { TrainSummary } from '../types/railway';

interface TrainSearchCardProps {
  initialQuery?: string;
  initialFrom?: string;
  initialTo?: string;
  initialDate?: string;
  availableTrains?: TrainSummary[];
  onSearch?: (filters: { q: string; from: string; to: string; date: string }) => void;
  floating?: boolean;
}

type PortalTab = 'search' | 'status' | 'eta';

export const TrainSearchCard: React.FC<TrainSearchCardProps> = ({
  initialQuery = '',
  initialFrom = '',
  initialTo = '',
  initialDate = 'Current service',
  availableTrains,
  onSearch,
  floating = true,
}) => {
  const [activeTab, setActiveTab] = useState<PortalTab>('search');
  const [query, setQuery] = useState(initialQuery);
  const [fromStation, setFromStation] = useState(initialFrom);
  const [toStation, setToStation] = useState(initialTo);
  const [journeyDate, setJourneyDate] = useState(initialDate);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [loadedTrains, setLoadedTrains] = useState<TrainSummary[]>(availableTrains || []);
  const [loadingTrains, setLoadingTrains] = useState<boolean>(!availableTrains);

  const navigate = useNavigate();

  useEffect(() => {
    if (availableTrains !== undefined) {
      setLoadedTrains(availableTrains);
      setLoadingTrains(false);
      return;
    }
    let cancelled = false;
    setLoadingTrains(true);
    searchTrains({})
      .then((res) => {
        if (!cancelled) setLoadedTrains(res);
      })
      .catch(() => {
        if (!cancelled) setLoadedTrains([]);
      })
      .finally(() => {
        if (!cancelled) setLoadingTrains(false);
      });
    return () => {
      cancelled = true;
    };
  }, [availableTrains]);

  const filteredSuggestions = loadedTrains.filter(
    (t) =>
      !query.trim() ||
      t.train_number.toLowerCase().includes(query.toLowerCase().trim()) ||
      t.train_name.toLowerCase().includes(query.toLowerCase().trim())
  );

  const uniqueStations = Array.from(
    new Map(
      loadedTrains.flatMap((t) => [
        [t.source_code, { code: t.source_code, name: t.source_name }],
        [t.destination_code, { code: t.destination_code, name: t.destination_name }],
      ])
    ).values()
  );

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setShowSuggestions(false);

    if (onSearch && activeTab === 'search') {
      onSearch({ q: query, from: fromStation, to: toStation, date: journeyDate });
      return;
    }

    const matchedTrain =
      loadedTrains.find(
        (t) => t.train_number.toLowerCase() === query.trim().toLowerCase()
      ) ||
      (query.trim()
        ? loadedTrains.find((t) =>
            t.train_name.toLowerCase().includes(query.trim().toLowerCase())
          )
        : undefined);

    if (activeTab === 'status' || activeTab === 'eta') {
      const target =
        matchedTrain ||
        loadedTrains.find((t) => t.has_routes || (t.route_count ?? 0) > 0) ||
        loadedTrains[0];
      if (target) {
        navigate(`/status/${target.train_number}`);
        return;
      }
    }

    if (matchedTrain && !fromStation.trim() && !toStation.trim()) {
      navigate(`/status/${matchedTrain.train_number}`);
      return;
    }

    const params = new URLSearchParams();
    if (query.trim()) params.set('q', query.trim());
    if (fromStation.trim()) params.set('from', fromStation.trim());
    if (toStation.trim()) params.set('to', toStation.trim());
    if (journeyDate && journeyDate !== 'Current service') params.set('date', journeyDate);
    navigate(`/search?${params.toString()}`);
  };

  const handleSwapStations = () => {
    const temp = fromStation;
    setFromStation(toStation);
    setToStation(temp);
  };

  const tabs: Array<{ id: PortalTab; label: string; icon: React.ElementType }> = [
    { id: 'search', label: 'Train Search', icon: Search },
    { id: 'status', label: 'Live Status', icon: Activity },
    { id: 'eta', label: 'ETA Prediction', icon: Cpu },
  ];

  return (
    <div
      className={`${
        floating ? '-mt-24 sm:-mt-28 relative z-20' : ''
      } max-w-[1200px] mx-auto px-4 sm:px-6 lg:px-8 animate-portal-fade`}
    >
      <div className="bg-white rounded-2xl shadow-xl border border-slate-200/90 p-6 sm:p-7">
        {/* Top Portal Tabs */}
        <div className="flex items-center justify-between border-b border-slate-200 mb-6 overflow-x-auto">
          <div className="flex items-center gap-2 sm:gap-6">
            {tabs.map((tab) => {
              const Icon = tab.icon;
              const isActive = activeTab === tab.id;
              return (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => setActiveTab(tab.id)}
                  className={`inline-flex items-center gap-2 pb-3.5 px-1 text-sm font-bold border-b-2 transition-colors whitespace-nowrap ${
                    isActive
                      ? 'text-blue-700 border-blue-700'
                      : 'text-slate-500 border-transparent hover:text-slate-800'
                  }`}
                >
                  <Icon className={`w-4 h-4 ${isActive ? 'text-blue-700' : 'text-slate-400'}`} />
                  <span>{tab.label}</span>
                </button>
              );
            })}
          </div>

          <span className="hidden md:inline-flex items-center gap-1.5 text-xs font-medium text-slate-500 pb-3">
            <span className="w-2 h-2 rounded-full bg-emerald-500" />
            {loadedTrains.length > 0
              ? `${loadedTrains.length} uploaded service${loadedTrains.length === 1 ? '' : 's'} available`
              : 'Awaiting dataset upload'}
          </span>
        </div>

        {/* Empty Database Onboarding inside Search Card */}
        {!loadingTrains && loadedTrains.length === 0 ? (
          <div className="py-6 px-4 rounded-xl bg-slate-50 border border-slate-200/80 flex flex-col sm:flex-row items-center justify-between gap-4">
            <div className="flex items-center gap-3.5 text-center sm:text-left flex-col sm:flex-row">
              <div className="w-11 h-11 rounded-xl bg-blue-50 border border-blue-200 text-blue-700 flex items-center justify-center shrink-0">
                <Database className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-base font-bold text-[#0F1F3D]">
                  No railway data has been uploaded yet.
                </h3>
                <p className="text-xs sm:text-sm text-slate-600 mt-0.5">
                  Upload stations.csv, trains.csv, and routes.csv in the Data Center to search
                  trains and view live ETA predictions.
                </p>
              </div>
            </div>
            <Link
              to="/data"
              className="inline-flex items-center gap-2 px-5 py-2.5 rounded-lg bg-blue-700 hover:bg-blue-800 text-white text-xs sm:text-sm font-bold shadow-sm transition-colors shrink-0"
            >
              <Database className="w-4 h-4" />
              OPEN DATA CENTER
            </Link>
          </div>
        ) : (
          /* Search Portal Form */
          <form onSubmit={handleSubmit} className="space-y-5">
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-12 gap-4 items-end">
              {/* FROM */}
              <div className="lg:col-span-3">
                <label className="block text-[11px] font-bold uppercase tracking-wider text-slate-500 mb-1.5">
                  FROM
                </label>
                <div className="relative">
                  <MapPin className="w-4 h-4 text-blue-700 absolute left-3.5 top-3.5" />
                  <input
                    type="text"
                    list="raileta-stations-from"
                    value={fromStation}
                    onChange={(e) => setFromStation(e.target.value)}
                    placeholder="Station / City"
                    className="w-full pl-10 pr-3 py-3 rounded-xl bg-slate-50 hover:bg-white focus:bg-white border border-slate-200 focus:border-blue-700 focus:ring-2 focus:ring-blue-700/15 text-sm font-semibold text-slate-900 placeholder:text-slate-400 transition-all outline-none"
                  />
                  <datalist id="raileta-stations-from">
                    {uniqueStations.map((s) => (
                      <option key={s.code} value={s.code}>
                        {s.name} ({s.code})
                      </option>
                    ))}
                  </datalist>
                </div>
              </div>

              {/* TO */}
              <div className="lg:col-span-3">
                <div className="flex items-center justify-between mb-1.5">
                  <label className="block text-[11px] font-bold uppercase tracking-wider text-slate-500">
                    TO
                  </label>
                  <button
                    type="button"
                    onClick={handleSwapStations}
                    className="text-[11px] font-semibold text-blue-700 hover:text-blue-900 inline-flex items-center gap-1"
                    title="Swap Origin and Destination"
                  >
                    <ArrowRightLeft className="w-3 h-3" />
                    Swap
                  </button>
                </div>
                <div className="relative">
                  <MapPin className="w-4 h-4 text-slate-500 absolute left-3.5 top-3.5" />
                  <input
                    type="text"
                    list="raileta-stations-to"
                    value={toStation}
                    onChange={(e) => setToStation(e.target.value)}
                    placeholder="Station / City"
                    className="w-full pl-10 pr-3 py-3 rounded-xl bg-slate-50 hover:bg-white focus:bg-white border border-slate-200 focus:border-blue-700 focus:ring-2 focus:ring-blue-700/15 text-sm font-semibold text-slate-900 placeholder:text-slate-400 transition-all outline-none"
                  />
                  <datalist id="raileta-stations-to">
                    {uniqueStations.map((s) => (
                      <option key={s.code} value={s.code}>
                        {s.name} ({s.code})
                      </option>
                    ))}
                  </datalist>
                </div>
              </div>

              {/* TRAIN */}
              <div className="lg:col-span-3 relative">
                <label className="block text-[11px] font-bold uppercase tracking-wider text-slate-500 mb-1.5">
                  TRAIN
                </label>
                <div className="relative">
                  <TrainFront className="w-4 h-4 text-blue-700 absolute left-3.5 top-3.5" />
                  <input
                    type="text"
                    value={query}
                    onFocus={() => setShowSuggestions(true)}
                    onBlur={() => setTimeout(() => setShowSuggestions(false), 180)}
                    onChange={(e) => setQuery(e.target.value)}
                    placeholder="Train number or name"
                    className="w-full pl-10 pr-4 py-3 rounded-xl bg-slate-50 hover:bg-white focus:bg-white border border-slate-200 focus:border-blue-700 focus:ring-2 focus:ring-blue-700/15 text-sm font-semibold text-slate-900 placeholder:text-slate-400 transition-all outline-none"
                  />
                </div>

                {/* Autocomplete Suggestions from Uploaded Trains */}
                {showSuggestions && filteredSuggestions.length > 0 && (
                  <div className="absolute left-0 right-0 top-full mt-1.5 bg-white rounded-xl shadow-xl border border-slate-200 py-1.5 z-40 max-h-60 overflow-y-auto">
                    <div className="px-3 py-1 text-[10px] font-bold uppercase tracking-wider text-slate-400">
                      Uploaded Services
                    </div>
                    {filteredSuggestions.map((t) => (
                      <button
                        type="button"
                        key={t.train_number}
                        onMouseDown={() => {
                          setQuery(t.train_number);
                          setFromStation(t.source_code);
                          setToStation(t.destination_code);
                          setShowSuggestions(false);
                        }}
                        className="w-full px-3.5 py-2 text-left hover:bg-blue-50 flex items-center justify-between transition-colors"
                      >
                        <div className="truncate pr-2">
                          <span className="font-mono text-xs font-bold text-blue-700 bg-blue-50 px-1.5 py-0.5 rounded border border-blue-200 mr-2">
                            {t.train_number}
                          </span>
                          <span className="text-xs font-semibold text-slate-800">
                            {t.train_name}
                          </span>
                        </div>
                        <span className="text-[11px] font-mono text-slate-500 shrink-0">
                          {t.source_code} → {t.destination_code}
                        </span>
                      </button>
                    ))}
                  </div>
                )}
              </div>

              {/* DATE / STATUS */}
              <div className="lg:col-span-3">
                <label className="block text-[11px] font-bold uppercase tracking-wider text-slate-500 mb-1.5">
                  DATE / STATUS
                </label>
                <div className="relative">
                  <Calendar className="w-4 h-4 text-slate-500 absolute left-3.5 top-3.5" />
                  <select
                    value={journeyDate}
                    onChange={(e) => setJourneyDate(e.target.value)}
                    aria-label="Date or Service Status"
                    className="w-full pl-10 pr-3 py-3 rounded-xl bg-slate-50 hover:bg-white focus:bg-white border border-slate-200 focus:border-blue-700 focus:ring-2 focus:ring-blue-700/15 text-sm font-semibold text-slate-900 transition-all outline-none"
                  >
                    <option value="Current service">Current service</option>
                    <option value="Active telemetry">Active telemetry</option>
                    <option value="Scheduled run">Scheduled run</option>
                  </select>
                </div>
              </div>
            </div>

            {/* Bottom Action Bar */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pt-2 border-t border-slate-100">
              <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500">
                <span className="font-semibold text-slate-600">Available Trains:</span>
                {loadedTrains.slice(0, 4).map((t) => (
                  <button
                    key={t.train_number}
                    type="button"
                    onClick={() => navigate(`/status/${t.train_number}`)}
                    className="px-2.5 py-1 rounded-md bg-slate-100 hover:bg-blue-50 text-slate-700 hover:text-blue-700 font-mono text-xs font-semibold transition-colors"
                  >
                    {t.train_number} ({t.source_code}→{t.destination_code})
                  </button>
                ))}
              </div>

              <button
                type="submit"
                className="inline-flex items-center justify-center gap-2 px-7 py-3.5 rounded-xl bg-blue-700 hover:bg-blue-800 text-white text-sm font-bold shadow-md transition-colors shrink-0"
              >
                <Search className="w-4 h-4" />
                <span>SEARCH TRAINS</span>
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
};
