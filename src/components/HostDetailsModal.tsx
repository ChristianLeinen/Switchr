import React, { useEffect } from 'react';
import {
  X,
  Server,
  Globe,
  Lock,
  Layers,
  Cpu,
  CheckCircle2,
  AlertTriangle,
} from 'lucide-react';
import { ManagedService, TargetHost } from '../types';

interface HostDetailsModalProps {
  host: TargetHost | null;
  services: ManagedService[];
  isOpen: boolean;
  onClose: () => void;
}

export const HostDetailsModal: React.FC<HostDetailsModalProps> = ({
  host,
  services,
  isOpen,
  onClose,
}) => {
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    if (isOpen) {
      window.addEventListener('keydown', handleKeyDown);
      document.body.style.overflow = 'hidden';
    }
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      document.body.style.overflow = 'unset';
    };
  }, [isOpen, onClose]);

  if (!isOpen || !host) return null;

  const isWindows = host.os_type === 'windows';
  const hostServices = services.filter((s) => s.host_id === host.id);

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="host-modal-title"
      className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-6 bg-black/75 backdrop-blur-sm animate-in fade-in duration-150"
      onClick={onClose}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-lg max-h-[90vh] flex flex-col rounded-xl border border-slate-200 dark:border-slate-700/80 bg-white dark:bg-[#0f172a] shadow-2xl shadow-black/80 text-slate-800 dark:text-slate-200 overflow-hidden transition-colors duration-150"
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900/60">
          <div className="flex items-center gap-3">
            <div
              className={`w-9 h-9 rounded-lg flex items-center justify-center font-mono text-xs font-bold ${
                isWindows
                  ? 'bg-blue-100 text-blue-700 dark:bg-blue-950/80 dark:text-blue-400 border border-blue-300 dark:border-blue-800/60'
                  : 'bg-amber-100 text-amber-700 dark:bg-amber-950/80 dark:text-amber-400 border border-amber-300 dark:border-amber-800/60'
              }`}
            >
              {isWindows ? 'WIN' : 'NIX'}
            </div>
            <div>
              <h2 id="host-modal-title" className="text-base font-display font-bold text-slate-900 dark:text-white">
                {host.name}
              </h2>
              <p className="text-xs text-slate-500 dark:text-slate-400">{host.description}</p>
            </div>
          </div>
          <button
            onClick={onClose}
            aria-label="Close dialog"
            className="p-1 rounded-md text-slate-400 hover:text-slate-700 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content Body */}
        <div className="flex-1 overflow-y-auto px-6 py-5 space-y-5 text-xs font-mono">
          {/* Section 1: Connection & Protocol */}
          <div className="space-y-2">
            <div className="text-[11px] font-mono uppercase tracking-wider text-slate-500 dark:text-slate-400 flex items-center gap-1.5 font-bold">
              <Globe className="w-3.5 h-3.5 text-sky-600 dark:text-sky-400" />
              <span>Network & Remote Protocol</span>
            </div>
            <div className="bg-slate-50 dark:bg-slate-950/70 border border-slate-200 dark:border-slate-800 rounded-lg p-3.5 space-y-2.5">
              <div className="flex items-center justify-between">
                <span className="text-slate-500 dark:text-slate-400">Host Identifier:</span>
                <span className="text-slate-900 dark:text-slate-200 font-semibold">{host.id}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-slate-500 dark:text-slate-400">IP Address / Hostname:</span>
                <span className="text-sky-600 dark:text-sky-400 font-bold">{host.hostname}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-slate-500 dark:text-slate-400">Port:</span>
                <span className="text-slate-900 dark:text-slate-200 font-semibold">{host.port}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-slate-500 dark:text-slate-400">Transport Layer:</span>
                <span className="text-slate-900 dark:text-slate-200">
                  {isWindows ? 'WinRM (WS-Management 5985)' : 'Paramiko SSH (Port 22)'}
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-slate-500 dark:text-slate-400">Operating System:</span>
                <span className="text-slate-900 dark:text-slate-200 capitalize">
                  {host.os_type} ({isWindows ? 'Windows Server' : 'Linux / Unix'})
                </span>
              </div>
            </div>
          </div>

          {/* Section 2: Managed Services Inventory */}
          <div className="space-y-2">
            <div className="text-[11px] font-mono uppercase tracking-wider text-slate-500 dark:text-slate-400 flex items-center justify-between font-bold">
              <span className="flex items-center gap-1.5">
                <Layers className="w-3.5 h-3.5 text-purple-600 dark:text-purple-400" />
                <span>Managed Services on Host</span>
              </span>
              <span className="text-[10px] text-slate-500">
                {hostServices.length} service{hostServices.length !== 1 ? 's' : ''}
              </span>
            </div>
            <div className="bg-slate-50 dark:bg-slate-950/70 border border-slate-200 dark:border-slate-800 rounded-lg divide-y divide-slate-200 dark:divide-slate-800/80 overflow-hidden">
              {hostServices.map((svc) => (
                <div key={svc.id} className="p-3 flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="font-semibold text-slate-900 dark:text-slate-100 truncate">{svc.name}</span>
                      <span className="text-[10px] text-slate-500">({svc.id})</span>
                    </div>
                    <div className="text-[10px] text-slate-500 mt-0.5">
                      Probe: {svc.verification_service_name}
                    </div>
                  </div>
                  <div className="shrink-0 flex items-center gap-1 text-[11px]">
                    {svc.is_locked ? (
                      <span className="text-amber-600 dark:text-amber-400 font-bold flex items-center gap-1">
                        <Lock className="w-3 h-3" /> Locked
                      </span>
                    ) : (
                      <span className="text-emerald-600 dark:text-emerald-400 font-medium flex items-center gap-1">
                        <CheckCircle2 className="w-3 h-3" /> Running
                      </span>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Footer actions */}
        <div className="px-6 py-3 border-t border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950/80 flex items-center justify-between">
          <span className="text-[11px] font-mono text-slate-500">Switchr Agentless Host Telemetry</span>
          <button
            onClick={onClose}
            className="px-4 py-1.5 text-xs font-medium rounded-md bg-slate-200 hover:bg-slate-300 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-800 dark:text-white transition-colors"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
};
