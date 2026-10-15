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
} from 'lucide-react';
import { ManagedService, OSType, TargetHost } from '../types';

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
  const [simulateFailures, setSimulateFailures] = useState<Record<string, boolean>>({});

  const handleProfileSelect = (serviceId: string, profileName: string) => {
    setSelectedProfiles((prev) => ({ ...prev, [serviceId]: profileName }));
  };

  const toggleSimulateFailure = (serviceId: string) => {
    setSimulateFailures((prev) => ({ ...prev, [serviceId]: !prev[serviceId] }));
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
      <div className="bg-[#0f172a] border border-slate-800 rounded-lg p-5 flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-display font-bold text-white tracking-tight">Managed Target Fleet</h1>
          <p className="text-sm text-slate-400 mt-1">
            Agentless profile orchestrator dispatching *.bat via WinRM and *.sh via SSH with strict concurrency locks.
          </p>
        </div>

        <div className="flex items-center gap-6 text-xs text-slate-400 shrink-0">
          <div>
            <div className="text-slate-500 font-mono uppercase tracking-wider text-[10px]">Hosts Fleet</div>
            <div className="text-lg font-mono font-bold text-white tabular-nums">{hosts.length}</div>
          </div>
          <div className="w-px h-8 bg-slate-800" />
          <div>
            <div className="text-slate-500 font-mono uppercase tracking-wider text-[10px]">Services</div>
            <div className="text-lg font-mono font-bold text-white tabular-nums">{totalServices}</div>
          </div>
          <div className="w-px h-8 bg-slate-800" />
          <div>
            <div className="text-slate-500 font-mono uppercase tracking-wider text-[10px]">Active Locks</div>
            <div className={`text-lg font-mono font-bold tabular-nums ${lockedServices > 0 ? 'text-amber-400' : 'text-emerald-400'}`}>
              {lockedServices}
            </div>
          </div>
          <button
            onClick={onRefresh}
            className="p-2 text-slate-400 hover:text-white bg-slate-800/80 hover:bg-slate-700 border border-slate-700/60 rounded-md transition-colors"
            title="Refresh fleet states"
          >
            <RotateCw className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Filter Toolbar */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
        {/* OS Filter Segmented Control */}
        <div className="flex items-center gap-1 p-1 bg-slate-900 border border-slate-800 rounded-lg shrink-0">
          <button
            onClick={() => setOsFilter('all')}
            className={`px-3 py-1.5 text-xs font-medium rounded transition-colors ${
              osFilter === 'all' ? 'bg-sky-600 text-white font-semibold shadow-sm' : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            All Hosts ({hosts.length})
          </button>
          <button
            onClick={() => setOsFilter('windows')}
            className={`px-3 py-1.5 text-xs font-medium rounded transition-colors ${
              osFilter === 'windows' ? 'bg-sky-600 text-white font-semibold shadow-sm' : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            Windows / WinRM
          </button>
          <button
            onClick={() => setOsFilter('unix')}
            className={`px-3 py-1.5 text-xs font-medium rounded transition-colors ${
              osFilter === 'unix' ? 'bg-sky-600 text-white font-semibold shadow-sm' : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            Linux / SSH
          </button>
        </div>

        {/* Search Input */}
        <div className="relative flex-1 sm:max-w-xs">
          <Search className="w-4 h-4 text-slate-500 absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search host or service..."
            className="w-full pl-9 pr-3 py-1.5 text-xs bg-slate-900 border border-slate-800 rounded-lg text-slate-200 placeholder-slate-500 focus:outline-none focus:border-sky-500 font-mono"
          />
        </div>
      </div>

      {/* Host Cards */}
      <div className="space-y-6">
        {filteredHosts.length === 0 ? (
          <div className="text-center py-12 bg-slate-900/40 border border-slate-800 rounded-lg">
            <Server className="w-8 h-8 text-slate-600 mx-auto mb-2" />
            <div className="text-sm font-medium text-slate-400">No matching hosts found</div>
            <div className="text-xs text-slate-500 mt-1">Try clearing your search query or switching filters</div>
          </div>
        ) : (
          filteredHosts.map((host) => {
            const hostServices = services.filter((s) => s.host_id === host.id);
            const isWindows = host.os_type === 'windows';

            return (
              <div
                key={host.id}
                className="bg-[#0c1220] border border-slate-800/90 rounded-lg overflow-hidden shadow-sm"
              >
                {/* Host Header */}
                <div className="px-5 py-4 bg-slate-900/60 border-b border-slate-800/80 flex flex-col md:flex-row md:items-center justify-between gap-3">
                  <div className="flex items-center gap-3">
                    <div
                      className={`w-8 h-8 rounded flex items-center justify-center font-mono text-xs font-bold ${
                        isWindows
                          ? 'bg-blue-950/80 text-blue-400 border border-blue-800/60'
                          : 'bg-amber-950/80 text-amber-400 border border-amber-800/60'
                      }`}
                    >
                      {isWindows ? 'WIN' : 'NIX'}
                    </div>

                    <div>
                      <div className="flex items-center gap-2">
                        <h2 className="text-base font-display font-bold text-white tracking-tight">{host.name}</h2>
                        <span className="text-xs font-mono text-slate-400">
                          {host.hostname}:{host.port}
                        </span>
                      </div>
                      <div className="flex items-center gap-2 text-xs text-slate-500 mt-0.5">
                        <span>{isWindows ? 'WinRM WS-Man' : 'Paramiko SSH'}</span>
                        <span aria-hidden="true">·</span>
                        <span>User: {host.auth.username}</span>
                        <span aria-hidden="true">·</span>
                        <span>{host.description}</span>
                      </div>
                    </div>
                  </div>

                  <div className="text-xs text-slate-400 font-mono">
                    {hostServices.length} managed service{hostServices.length > 1 ? 's' : ''}
                  </div>
                </div>

                {/* Services List */}
                <div className="divide-y divide-slate-800/60">
                  {hostServices.map((service) => {
                    const isLocked = service.is_locked;
                    const selectedProfile = selectedProfiles[service.id] || service.current_profile;
                    const isFailureSimulated = Boolean(simulateFailures[service.id]);
                    const isDifferentProfile = selectedProfile !== service.current_profile;

                    return (
                      <div
                        key={service.id}
                        className={`p-5 transition-colors ${
                          isLocked ? 'bg-amber-950/10' : 'hover:bg-slate-900/30'
                        }`}
                      >
                        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
                          {/* Service Details */}
                          <div className="space-y-1.5 flex-1 min-w-0">
                            <div className="flex items-center gap-3">
                              <h3 className="text-sm font-semibold text-slate-100">{service.name}</h3>

                              {/* Status Badge */}
                              {isLocked ? (
                                <span className="inline-flex items-center gap-1.5 text-xs font-mono text-amber-400">
                                  <Lock className="w-3 h-3 text-amber-400 animate-pulse" />
                                  TRANSITIONING (LOCKED)
                                </span>
                              ) : service.status === 'ERROR' ? (
                                <span className="inline-flex items-center gap-1 text-xs font-mono text-rose-400">
                                  <AlertTriangle className="w-3 h-3 text-rose-400" />
                                  PROBE FAILED
                                </span>
                              ) : (
                                <span className="inline-flex items-center gap-1 text-xs font-mono text-emerald-400">
                                  <CheckCircle2 className="w-3 h-3 text-emerald-400" />
                                  RUNNING
                                </span>
                              )}
                            </div>

                            {/* Service Metadata (Zero-Pill) */}
                            <div className="flex flex-wrap items-center gap-2 text-xs text-slate-400 font-mono">
                              <span>Active: <strong className="text-sky-300 font-normal">{service.current_profile}</strong></span>
                              <span aria-hidden="true">·</span>
                              <span>Verification Probe: <span className="text-slate-300">{service.verification_service_name}</span></span>
                              <span aria-hidden="true">·</span>
                              <span className="text-slate-500">{service.service_type}</span>
                            </div>

                            <p className="text-xs text-slate-400 line-clamp-1">{service.description}</p>
                          </div>

                          {/* Profile Switch Controls */}
                          <div className="flex flex-wrap items-center gap-3 shrink-0">
                            {/* Profile Dropdown */}
                            <div className="relative">
                              <select
                                value={selectedProfile}
                                onChange={(e) => handleProfileSelect(service.id, e.target.value)}
                                disabled={isLocked}
                                className={`text-xs font-mono px-3 py-2 bg-slate-900 border rounded-md text-slate-200 focus:outline-none focus:border-sky-500 transition-colors ${
                                  isLocked
                                    ? 'border-slate-800 text-slate-600 cursor-not-allowed'
                                    : isDifferentProfile
                                    ? 'border-sky-500/80 text-sky-200'
                                    : 'border-slate-700 text-slate-300'
                                }`}
                              >
                                {service.profiles.map((p) => (
                                  <option key={p.name} value={p.name}>
                                    {p.name} ({p.timeout_seconds}s)
                                  </option>
                                ))}
                              </select>
                            </div>

                            {/* Failure Simulation Checkbox for Fail-Fast Testing */}
                            <label
                              title="Simulate script failure exit code 1 to verify fail-fast behavior and error log generation"
                              className="hidden sm:inline-flex items-center gap-1.5 text-xs text-slate-400 cursor-pointer select-none font-mono"
                            >
                              <input
                                type="checkbox"
                                checked={isFailureSimulated}
                                onChange={() => toggleSimulateFailure(service.id)}
                                disabled={isLocked}
                                className="rounded bg-slate-900 border-slate-700 text-rose-500 focus:ring-0 w-3.5 h-3.5"
                              />
                              <span className={isFailureSimulated ? 'text-rose-400 font-bold' : ''}>Fail-Fast Test</span>
                            </label>

                            {/* Switch Action Button */}
                            <button
                              onClick={() => onInitiateSwitch(host, service, selectedProfile, isFailureSimulated)}
                              disabled={isLocked}
                              className={`px-3.5 py-2 text-xs font-medium rounded-md flex items-center gap-1.5 transition-colors whitespace-nowrap ${
                                isLocked
                                  ? 'bg-slate-800 text-slate-600 border border-slate-800 cursor-not-allowed'
                                  : isDifferentProfile
                                  ? 'bg-sky-600 hover:bg-sky-500 text-white shadow-sm'
                                  : 'bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700'
                              }`}
                            >
                              {isLocked ? (
                                <>
                                  <Lock className="w-3.5 h-3.5" />
                                  Locked
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
                                className="px-3 py-2 text-xs font-mono text-sky-400 hover:text-sky-300 bg-sky-950/40 hover:bg-sky-950/80 border border-sky-800/80 rounded-md transition-colors flex items-center gap-1.5"
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
    </div>
  );
};
