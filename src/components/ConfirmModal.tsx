import React from 'react';
import { ShieldAlert, AlertTriangle, ArrowRight, X, Clock, Terminal, CheckCircle2 } from 'lucide-react';
import { ConfigProfile, ManagedService, TargetHost } from '../types';

interface ConfirmModalProps {
  isOpen: boolean;
  host: TargetHost | null;
  service: ManagedService | null;
  targetProfileName: string;
  simulateFailure: boolean;
  onConfirm: () => void;
  onClose: () => void;
}

export const ConfirmModal: React.FC<ConfirmModalProps> = ({
  isOpen,
  host,
  service,
  targetProfileName,
  simulateFailure,
  onConfirm,
  onClose,
}) => {
  if (!isOpen || !host || !service) return null;

  const profile = service.profiles.find((p) => p.name === targetProfileName) || service.profiles[0];
  const isWindows = host.os_type === 'windows';
  const command = `${profile.script_path} ${profile.parameters.join(' ')}`;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="bg-[#0f172a] border border-slate-700/80 rounded-xl max-w-lg w-full overflow-hidden shadow-2xl space-y-0">
        {/* Header */}
        <div className="p-5 border-b border-slate-800 flex items-center justify-between bg-slate-900/60">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-sky-950 border border-sky-800 text-sky-400 flex items-center justify-center">
              <Terminal className="w-4 h-4" />
            </div>
            <div>
              <h3 className="text-base font-display font-bold text-white">Confirm Configuration Switch</h3>
              <p className="text-xs text-slate-400">Agentless remote execution with mutual exclusion lock</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="text-slate-400 hover:text-white p-1 rounded transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content Body */}
        <div className="p-6 space-y-5">
          {/* Transition Summary Grid */}
          <div className="bg-slate-950/70 border border-slate-800 rounded-lg p-4 space-y-3 font-mono text-xs">
            <div className="flex justify-between items-center text-slate-400">
              <span>Target Host:</span>
              <span className="text-slate-200 font-semibold flex items-center gap-1.5">
                <span className={`text-[10px] px-1.5 py-0.2 rounded ${isWindows ? 'bg-blue-950 text-blue-300' : 'bg-orange-950 text-orange-300'}`}>
                  {isWindows ? 'WIN' : 'UNIX'}
                </span>
                {host.name} ({host.hostname})
              </span>
            </div>

            <div className="flex justify-between items-center text-slate-400">
              <span>Managed Service:</span>
              <span className="text-slate-200 font-semibold">{service.name}</span>
            </div>

            <div className="flex justify-between items-center text-slate-400">
              <span>Current Profile:</span>
              <span className="text-slate-400">{service.current_profile}</span>
            </div>

            <div className="flex justify-between items-center border-t border-slate-800/80 pt-2 text-slate-300">
              <span className="text-sky-400 font-bold flex items-center gap-1">
                <ArrowRight className="w-3.5 h-3.5" /> Target Profile:
              </span>
              <span className="text-sky-300 font-bold">{targetProfileName}</span>
            </div>

            <div className="flex justify-between items-center text-slate-500 text-[11px]">
              <span>Verification Probe:</span>
              <span className="text-slate-300">
                {isWindows ? `sc query "${service.verification_service_name}"` : `systemctl is-active "${service.verification_service_name}"`}
              </span>
            </div>

            <div className="flex justify-between items-center text-slate-500 text-[11px]">
              <span>Timeout Budget:</span>
              <span className="text-slate-300">{profile.timeout_seconds}s</span>
            </div>
          </div>

          {/* Command Preview */}
          <div className="space-y-1.5">
            <label className="text-[11px] font-mono uppercase tracking-wider text-slate-400">
              Execution Command
            </label>
            <div className="p-3 bg-[#070b14] border border-slate-800 rounded text-xs font-mono text-emerald-400 break-all select-all">
              {command}
            </div>
          </div>

          {/* Fail-Fast Warning if testing failure */}
          {simulateFailure && (
            <div className="flex items-start gap-2.5 p-3 bg-rose-950/40 border border-rose-800/80 rounded-lg text-xs text-rose-300">
              <AlertTriangle className="w-4 h-4 text-rose-400 shrink-0 mt-0.5" />
              <div>
                <span className="font-bold">Fail-Fast Test Mode Active:</span> This execution is configured to simulate an exit code 1 to demonstrate that execution halts immediately with forensic logs and no blind rollback.
              </div>
            </div>
          )}

          {/* Operational Safety Lock Notice */}
          <div className="flex items-start gap-2 text-xs text-slate-400 bg-slate-900/60 p-3 rounded border border-slate-800/60">
            <ShieldAlert className="w-4 h-4 text-sky-400 shrink-0 mt-0.5" />
            <span>
              An in-memory lock will be held for <strong className="text-slate-300">({host.id}, {service.id})</strong>. Concurrent switch requests while this job runs will be rejected with HTTP 409 Conflict.
            </span>
          </div>
        </div>

        {/* Footer Actions */}
        <div className="p-4 bg-slate-900/80 border-t border-slate-800 flex items-center justify-end gap-3">
          <button
            onClick={onClose}
            className="px-4 py-2 text-xs font-medium text-slate-400 hover:text-white transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={onConfirm}
            className="px-4 py-2 text-xs font-medium bg-sky-600 hover:bg-sky-500 text-white rounded-md transition-colors flex items-center gap-1.5 shadow"
          >
            <CheckCircle2 className="w-3.5 h-3.5" />
            Confirm & Execute
          </button>
        </div>
      </div>
    </div>
  );
};
