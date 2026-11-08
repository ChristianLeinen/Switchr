import React, { useEffect, useState } from 'react';
import {
  ShieldAlert,
  AlertTriangle,
  ArrowRight,
  X,
  Terminal,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  Clock,
  Layers,
} from 'lucide-react';
import { ConfigProfile, getEffectiveScripts, ManagedService, TargetHost } from '../types';

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
  const [showExecutionDetails, setShowExecutionDetails] = useState(false);

  // Reset accordion state when opening or closing modal
  useEffect(() => {
    if (!isOpen) {
      setShowExecutionDetails(false);
    }
  }, [isOpen]);

  if (!isOpen || !host || !service) return null;

  const profile = service.profiles.find((p) => p.name === targetProfileName) || service.profiles[0];
  const isWindows = host.os_type === 'windows';
  const isSingleProfile = service.profiles.length === 1;
  const effectiveScripts = getEffectiveScripts(profile);
  const totalTimeoutSeconds = effectiveScripts.reduce((sum, s) => sum + (s.timeout_seconds || 60), 0);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="bg-white dark:bg-[#0f172a] border border-slate-200 dark:border-slate-700/80 rounded-xl max-w-lg w-full overflow-hidden shadow-2xl space-y-0 transition-colors duration-150">
        {/* Header */}
        <div className="p-5 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between bg-slate-50 dark:bg-slate-900/60">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-sky-100 dark:bg-sky-950 border border-sky-300 dark:border-sky-800 text-sky-600 dark:text-sky-400 flex items-center justify-center">
              <Terminal className="w-4 h-4" />
            </div>
            <div>
              <h3 className="text-base font-display font-bold text-slate-900 dark:text-white">
                {isSingleProfile ? 'Confirm Execution' : 'Confirm Configuration Switch'}
              </h3>
            </div>
          </div>
          <button
            onClick={onClose}
            aria-label="Close dialog"
            className="text-slate-400 hover:text-slate-700 dark:hover:text-white p-1 rounded transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content Body */}
        <div className="p-6 space-y-4">
          {/* Transition Summary Grid (Clean & Compact) */}
          <div className="bg-slate-50 dark:bg-slate-950/70 border border-slate-200 dark:border-slate-800 rounded-lg p-4 space-y-3 font-mono text-xs">
            <div className="flex justify-between items-center text-slate-500 dark:text-slate-400">
              <span>Target Host:</span>
              <span className="text-slate-900 dark:text-slate-200 font-semibold flex items-center gap-1.5">
                <span className={`text-[10px] px-1.5 py-0.2 rounded font-bold ${isWindows ? 'bg-blue-100 text-blue-700 dark:bg-blue-950 dark:text-blue-300' : 'bg-amber-100 text-amber-700 dark:bg-orange-950 dark:text-orange-300'}`}>
                  {isWindows ? 'WIN' : 'UNIX'}
                </span>
                {host.name} ({host.hostname})
              </span>
            </div>

            <div className="flex justify-between items-center text-slate-500 dark:text-slate-400">
              <span>Managed Service:</span>
              <span className="text-slate-900 dark:text-slate-200 font-semibold">{service.name}</span>
            </div>

            {!isSingleProfile && (
              <div className="flex justify-between items-center text-slate-500 dark:text-slate-400">
                <span>Current Profile:</span>
                <span className={service.current_profile ? 'text-slate-900 dark:text-slate-200' : 'text-slate-400 dark:text-slate-500 italic'}>
                  {service.current_profile || 'None (Unassigned)'}
                </span>
              </div>
            )}

            <div className={`flex justify-between items-center ${!isSingleProfile ? 'border-t border-slate-200 dark:border-slate-800/80 pt-2' : ''} text-slate-700 dark:text-slate-300`}>
              <span className="text-sky-600 dark:text-sky-400 font-bold flex items-center gap-1">
                <ArrowRight className="w-3.5 h-3.5" /> {isSingleProfile ? 'Action Pipeline:' : 'Target Profile:'}
              </span>
              <span className="text-sky-600 dark:text-sky-300 font-bold">{targetProfileName}</span>
            </div>
          </div>

          {/* Expandable Accordion: Execution Details */}
          <div className="border border-slate-200 dark:border-slate-800 rounded-lg overflow-hidden bg-slate-50/50 dark:bg-slate-900/30">
            <button
              type="button"
              onClick={() => setShowExecutionDetails((prev) => !prev)}
              aria-expanded={showExecutionDetails}
              className="w-full px-4 py-2.5 flex items-center justify-between text-xs font-mono text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800/60 transition-colors select-none"
            >
              <div className="flex items-center gap-2 font-medium">
                {showExecutionDetails ? (
                  <ChevronDown className="w-4 h-4 text-sky-600 dark:text-sky-400 shrink-0" />
                ) : (
                  <ChevronRight className="w-4 h-4 text-slate-400 shrink-0" />
                )}
                <span>Execution Details</span>
                <span className="text-[10px] px-1.5 py-0.5 rounded bg-slate-200 dark:bg-slate-800 text-slate-600 dark:text-slate-400">
                  {effectiveScripts.length} {effectiveScripts.length === 1 ? 'step' : 'steps'} · {totalTimeoutSeconds}s
                </span>
              </div>
              <span className="text-[11px] text-sky-600 dark:text-sky-400 underline-offset-2 hover:underline">
                {showExecutionDetails ? 'Hide' : 'Show'}
              </span>
            </button>

            {showExecutionDetails && (
              <div className="p-4 pt-2 border-t border-slate-200 dark:border-slate-800/80 space-y-4 animate-in fade-in duration-150">
                {/* Verification Probe & Timeout Summary */}
                <div className="bg-white dark:bg-slate-950/70 border border-slate-200 dark:border-slate-800 rounded-lg p-3 space-y-2 text-xs font-mono">
                  <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center gap-1 text-slate-500 dark:text-slate-400">
                    <span className="shrink-0">Verification Probe:</span>
                    <span className="text-slate-800 dark:text-slate-300 font-mono text-[11px] break-all sm:text-right">
                      {isWindows
                        ? `sc query "${service.verification_service_name}"`
                        : `systemctl is-active "${service.verification_service_name}"`}
                    </span>
                  </div>

                  <div className="flex justify-between items-center text-slate-500 dark:text-slate-400 border-t border-slate-100 dark:border-slate-800/60 pt-2">
                    <span>Total Timeout:</span>
                    <span className="text-slate-800 dark:text-slate-300 font-semibold">
                      {totalTimeoutSeconds}s ({effectiveScripts.length} sequential {effectiveScripts.length === 1 ? 'step' : 'steps'})
                    </span>
                  </div>
                </div>

                {/* Numbered Sequential Script Pipeline Preview */}
                <div className="space-y-1.5">
                  <label className="text-[11px] font-mono uppercase tracking-wider text-slate-500 dark:text-slate-400 font-medium">
                    Sequential Script Pipeline
                  </label>
                  <div className="bg-slate-100/90 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg p-3 space-y-2 font-mono text-xs max-h-48 overflow-y-auto">
                    {effectiveScripts.map((step, idx) => (
                      <div
                        key={idx}
                        className="flex items-start gap-2.5 pb-2 border-b border-slate-200 dark:border-slate-800 last:border-b-0 last:pb-0"
                      >
                        <span className="text-sky-600 dark:text-sky-400 font-bold select-none">{idx + 1}.</span>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center justify-between gap-2">
                            <span className="text-slate-900 dark:text-slate-200 font-medium truncate">{step.name || 'Script'}</span>
                            <span className="text-[10px] text-slate-500 dark:text-slate-400 shrink-0">{step.timeout_seconds || 60}s</span>
                          </div>
                          <div className="text-[11px] text-slate-600 dark:text-slate-400 font-mono break-all mt-0.5">
                            {step.script_path} {(step.parameters || []).join(' ')}
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Fail-Fast Warning if testing failure */}
                {simulateFailure && (
                  <div className="flex items-start gap-2.5 p-3 bg-rose-50 dark:bg-rose-950/40 border border-rose-300 dark:border-rose-800/80 rounded-lg text-xs text-rose-700 dark:text-rose-300">
                    <AlertTriangle className="w-4 h-4 text-rose-600 dark:text-rose-400 shrink-0 mt-0.5" />
                    <div>
                      <span className="font-bold">Fail-Fast Test Mode Active:</span> This execution is configured to simulate a script exit code 1 to demonstrate that execution halts immediately without attempting subsequent steps or rollback.
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>

        {/* Footer Actions */}
        <div className="p-4 bg-slate-50 dark:bg-slate-900/80 border-t border-slate-200 dark:border-slate-800 flex items-center justify-end gap-3">
          <button
            onClick={onClose}
            className="px-4 py-2 text-xs font-medium text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={onConfirm}
            className="px-4 py-2 text-xs font-medium bg-sky-600 hover:bg-sky-500 text-white rounded-md transition-colors flex items-center gap-1.5 shadow"
          >
            <CheckCircle2 className="w-3.5 h-3.5" />
            Confirm & Execute Pipeline
          </button>
        </div>
      </div>
    </div>
  );
};
