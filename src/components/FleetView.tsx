import React, { useState } from 'react';
import {
  Server,
  Terminal,
  ShieldCheck,
  Lock,
  ArrowRight,
  Search,
  CheckCircle2,
  AlertTriangle,
  RotateCw,
  Sliders,
  Flame,
  FileText,
  Info,
  Play,
} from 'lucide-react';
import { getEffectiveScripts, ManagedService, OSType, TargetHost } from '../types';
import { HostDetailsModal } from './HostDetailsModal';

interface FleetViewProps {
  hosts: TargetHost[];
  services: ManagedService[];
  onInitiateSwitch: (host: TargetHost, service: ManagedService, targetProfile: string, simulateFailure: boolean) => void;
  onOpenLiveStream: (jobId: string, label: string) => void;
  onRefresh: () => void;
}

export const FleetView: React.FC<FleetViewProps> = ({
  hosts,
  services,
  onInitiateSwitch,
  onOpenLiveStream,
  onRefresh,
}) => {
  const [osFilter, setOsFilter] = useState<'all' | 'windows' | 'unix'>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedProfiles, setSelectedProfiles] = useState<Record<string, string>>({});
  const [selectedHostForDetails, setSelectedHostForDetails] = useState<TargetHost | null>(null);

  const handleProfileSelect = (serviceId: string, profileName: string) => {
    setSelectedProfiles((prev) => ({ ...prev, [serviceId]: profileName }));
  };

  // Filter hosts
  const filteredHosts = hosts.filter((host) => {
    if (osFilter !== 'all' && host.os_type !== osFilter) return false;
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      const hostMatch = host.name.toLowerCase().includes(q) || host.hostname.toLowerCase().includes(q);
      const hostServices = services.filter((s) => s.host_id === host.id);
      const serviceMatch = hostServices.some(
        (s) => s.name.toLowerCase().includes(q) || s.verification_service_name.toLowerCase().includes(q)
      );
      return hostMatch || serviceMatch;
    }
    return true;
  });

  const totalServices = services.length;
  const lockedServices = services.filter((s) => s.is_locked).length;

  return (
    <div className="space-y-6">
      {/* Top Banner / Summary Strip */}
      <div className="bg-white dark:bg-[#0f172a] border border-slate-200 dark:border-slate-800 rounded-lg p-5 flex flex-col md:flex-row md:items-center justify-between gap-4 shadow-sm transition-colors duration-150">
        <div>
          <h1 className="text-xl font-display font-bold text-slate-900 dark:text-white tracking-tight">Fleet & Services</h1>
        </div>

        <div className="flex items-center gap-6 text-xs text-slate-600 dark:text-slate-400 shrink-0">
          <div>
            <div className="text-slate-500 font-mono uppercase tracking-wider text-[10px]">Hosts Fleet</div>
            <div className="text-lg font-mono font-bold text-slate-900 dark:text-white tabular-nums">{hosts.length}</div>
          </div>
          <div className="w-px h-8 bg-slate-200 dark:bg-slate-800" />
          <div>
            <div className="text-slate-500 font-mono uppercase tracking-wider text-[10px]">Services</div>
            <div className="text-lg font-mono font-bold text-slate-900 dark:text-white tabular-nums">{totalServices}</div>
          </div>
          <div className="w-px h-8 bg-slate-200 dark:bg-slate-800" />
          <div>
            <div className="text-slate-500 font-mono uppercase tracking-wider text-[10px]">Active Locks</div>
            <div className={`text-lg font-mono font-bold tabular-nums ${lockedServices > 0 ? 'text-amber-600 dark:text-amber-400' : 'text-emerald-600 dark:text-emerald-400'}`}>
              {lockedServices}
            </div>
          </div>
          <button
            onClick={onRefresh}
            className="p-2 text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white bg-slate-100 hover:bg-slate-200 dark:bg-slate-800/80 dark:hover:bg-slate-700 border border-slate-300 dark:border-slate-700/60 rounded-md transition-colors"
            title="Refresh fleet states"
          >
            <RotateCw className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Filter Toolbar */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
        {/* OS Filter Segmented Control */}
        <div className="flex items-center gap-1 p-1 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg shrink-0 shadow-sm transition-colors duration-150">
          <button
            onClick={() => setOsFilter('all')}
            className={`px-3 py-1.5 text-xs font-medium rounded transition-colors ${osFilter === 'all'
              ? 'bg-sky-600 text-white font-semibold shadow-sm'
              : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
              }`}
          >
            All Hosts ({hosts.length})
          </button>
          <button
            onClick={() => setOsFilter('windows')}
            className={`px-3 py-1.5 text-xs font-medium rounded transition-colors ${osFilter === 'windows'
              ? 'bg-sky-600 text-white font-semibold shadow-sm'
              : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
              }`}
          >
            Windows / WinRM
          </button>
          <button
            onClick={() => setOsFilter('unix')}
            className={`px-3 py-1.5 text-xs font-medium rounded transition-colors ${osFilter === 'unix'
              ? 'bg-sky-600 text-white font-semibold shadow-sm'
              : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
              }`}
          >
            Linux / SSH
          </button>
        </div>

        {/* Search Input */}
        <div className="relative flex-1 sm:max-w-xs">
          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search host or service..."
            className="w-full pl-9 pr-3 py-1.5 text-xs bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg text-slate-800 dark:text-slate-200 placeholder-slate-400 dark:placeholder-slate-500 focus:outline-none focus:border-sky-500 font-mono shadow-sm transition-colors duration-150"
          />
        </div>
      </div>

      {/* Host Cards */}
      <div className="space-y-6">
        {filteredHosts.length === 0 ? (
          <div className="text-center py-12 bg-white dark:bg-slate-900/40 border border-slate-200 dark:border-slate-800 rounded-lg shadow-sm">
            <Server className="w-8 h-8 text-slate-400 dark:text-slate-600 mx-auto mb-2" />
            <div className="text-sm font-medium text-slate-600 dark:text-slate-400">No matching hosts found</div>
            <div className="text-xs text-slate-400 dark:text-slate-500 mt-1">Try clearing your search query or switching filters</div>
          </div>
        ) : (
          filteredHosts.map((host) => {
            const hostServices = services.filter((s) => s.host_id === host.id);
            const isWindows = host.os_type === 'windows';

            return (
              <div
                key={host.id}
                className="bg-white dark:bg-[#0c1220] border border-slate-200 dark:border-slate-800/90 rounded-lg overflow-hidden shadow-sm transition-colors duration-150"
              >
                {/* Host Header (Decluttered) */}
                <div className="px-5 py-4 bg-slate-50/80 dark:bg-slate-900/60 border-b border-slate-200 dark:border-slate-800/80 flex items-center justify-between gap-3">
                  <div className="flex items-center gap-3 min-w-0">
                    <div
                      className={`w-8 h-8 rounded flex items-center justify-center font-mono text-xs font-bold shrink-0 ${isWindows
                        ? 'bg-blue-100 text-blue-700 dark:bg-blue-950/80 dark:text-blue-400 border border-blue-300 dark:border-blue-800/60'
                        : 'bg-amber-100 text-amber-700 dark:bg-amber-950/80 dark:text-amber-400 border border-amber-300 dark:border-amber-800/60'
                        }`}
                    >
                      {isWindows ? 'WIN' : 'NIX'}
                    </div>

                    <div className="min-w-0">
                      <h2 className="text-base font-display font-bold text-slate-900 dark:text-white tracking-tight truncate">
                        {host.name}
                      </h2>
                      <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5 truncate">
                        {host.description}
                      </p>
                    </div>
                  </div>

                  {/* Info Icon Button Opening Details Modal */}
                  <button
                    onClick={() => setSelectedHostForDetails(host)}
                    aria-label={`View connection details for ${host.name}`}
                    title={`View connection details for ${host.name}`}
                    className="p-1.5 rounded-md text-slate-500 dark:text-slate-400 hover:text-sky-600 dark:hover:text-sky-400 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors shrink-0"
                  >
                    <Info className="w-4 h-4" />
                  </button>
                </div>

                {/* Services List */}
                <div className="divide-y divide-slate-200 dark:divide-slate-800/60">
                  {hostServices.map((service) => {
                    const isLocked = service.is_locked;
                    const isSingleProfile = service.profiles.length === 1;
                    const soleProfile = isSingleProfile ? service.profiles[0].name : '';
                    const selectedProfile = isSingleProfile
                      ? soleProfile
                      : selectedProfiles[service.id] ?? (service.current_profile || '');
                    const isDifferentProfile = !isSingleProfile && selectedProfile !== '' && selectedProfile !== service.current_profile;

                    return (
                      <div
                        key={service.id}
                        className={`p-5 transition-colors duration-150 ${isLocked
                          ? 'bg-amber-50/70 dark:bg-amber-950/10'
                          : 'hover:bg-slate-50/80 dark:hover:bg-slate-900/30'
                          }`}
                      >
                        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
                          {/* Service Details */}
                          <div className="space-y-1.5 flex-1 min-w-0">
                            <div className="flex items-center gap-3">
                              <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">{service.name}</h3>

                              {/* Status Badge */}
                              {isLocked ? (
                                <span className="inline-flex items-center gap-1.5 text-xs font-mono text-amber-600 dark:text-amber-400 font-medium">
                                  <Lock className="w-3 h-3 text-amber-500 dark:text-amber-400 animate-pulse" />
                                  TRANSITIONING (LOCKED)
                                </span>
                              ) : service.status === 'ERROR' ? (
                                <span className="inline-flex items-center gap-1 text-xs font-mono text-rose-600 dark:text-rose-400 font-medium">
                                  <AlertTriangle className="w-3 h-3 text-rose-500 dark:text-rose-400" />
                                  PROBE FAILED
                                </span>
                              ) : (
                                <span className="inline-flex items-center gap-1 text-xs font-mono text-emerald-600 dark:text-emerald-400 font-medium">
                                  <CheckCircle2 className="w-3 h-3 text-emerald-500 dark:text-emerald-400" />
                                  RUNNING
                                </span>
                              )}
                            </div>

                            <p className="text-xs text-slate-500 dark:text-slate-400 line-clamp-1">{service.description}</p>
                          </div>

                          {/* Profile Switch / Execution Controls */}
                          <div className="flex flex-wrap items-center gap-3 shrink-0">
                            {/* Profile Dropdown (Only rendered for multi-profile services) */}
                            {!isSingleProfile && (
                              <div className="relative">
                                <select
                                  value={selectedProfile}
                                  onChange={(e) => handleProfileSelect(service.id, e.target.value)}
                                  disabled={isLocked}
                                  className={`text-xs font-mono px-3 py-2 bg-white dark:bg-slate-900 border rounded-md text-slate-800 dark:text-slate-200 focus:outline-none focus:border-sky-500 transition-colors shadow-sm ${isLocked
                                    ? 'border-slate-200 dark:border-slate-800 text-slate-400 dark:text-slate-600 cursor-not-allowed'
                                    : !selectedProfile
                                      ? 'border-amber-500 text-amber-700 dark:text-amber-300'
                                      : isDifferentProfile
                                        ? 'border-sky-500 text-sky-700 dark:text-sky-200'
                                        : 'border-slate-300 dark:border-slate-700 text-slate-700 dark:text-slate-300'
                                    }`}
                                >
                                  {!service.current_profile && (
                                    <option value="" disabled>
                                      -- Select profile to apply --
                                    </option>
                                  )}
                                  {service.profiles.map((p) => {
                                    const steps = getEffectiveScripts(p);
                                    const totalTimeout = steps.reduce(
                                      (sum, s) => sum + (s.timeout_seconds || 60),
                                      0
                                    );
                                    return (
                                      <option key={p.name} value={p.name}>
                                        {p.name} ({steps.length} {steps.length === 1 ? 'step' : 'steps'}, {totalTimeout}s)
                                      </option>
                                    );
                                  })}
                                </select>
                              </div>
                            )}

                            {/* Action Button: Execute (Single profile) vs Switch Profile (Multiple profiles) */}
                            <button
                              onClick={() => {
                                if (!selectedProfile) return;
                                onInitiateSwitch(host, service, selectedProfile, false);
                              }}
                              disabled={isLocked || !selectedProfile}
                              className={`px-3.5 py-2 text-xs font-medium rounded-md flex items-center gap-1.5 transition-colors whitespace-nowrap shadow-sm ${
                                isLocked || !selectedProfile
                                  ? 'bg-slate-100 dark:bg-slate-800 text-slate-400 dark:text-slate-600 border border-slate-200 dark:border-slate-800 cursor-not-allowed'
                                  : isDifferentProfile
                                  ? 'bg-sky-600 hover:bg-sky-500 text-white shadow-sky-950/20'
                                  : 'bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-800 dark:text-slate-200 border border-slate-300 dark:border-slate-700'
                              }`}
                            >
                              {isLocked ? (
                                <>
                                  <Lock className="w-3.5 h-3.5" />
                                  Locked
                                </>
                              ) : isSingleProfile ? (
                                <>
                                  <Play className="w-3.5 h-3.5 fill-current" />
                                  Execute
                                </>
                              ) : (
                                <>
                                  <ArrowRight className="w-3.5 h-3.5" />
                                  Switch Profile
                                </>
                              )}
                            </button>

                            {/* View Live Stream Button if currently transitioning */}
                            {isLocked && service.active_job_id && (
                              <button
                                onClick={() => onOpenLiveStream(service.active_job_id!, `${service.name} (Active Stream)`)}
                                className="px-3 py-2 text-xs font-mono text-sky-600 dark:text-sky-400 hover:text-sky-700 dark:hover:text-sky-300 bg-sky-50 dark:bg-sky-950/40 hover:bg-sky-100 dark:hover:bg-sky-950/80 border border-sky-300 dark:border-sky-800/80 rounded-md transition-colors flex items-center gap-1.5 shadow-sm"
                              >
                                <Terminal className="w-3.5 h-3.5" />
                                Live Stream
                              </button>
                            )}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* Host Details Popup Modal */}
      <HostDetailsModal
        host={selectedHostForDetails}
        services={services}
        isOpen={Boolean(selectedHostForDetails)}
        onClose={() => setSelectedHostForDetails(null)}
      />
    </div>
  );
};
