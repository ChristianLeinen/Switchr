import React, { useEffect, useRef, useState } from 'react';
import {
  X,
  Square,
  Download,
  Terminal,
  Search,
  CheckCircle2,
  AlertCircle,
  Clock,
  Copy,
  Check,
} from 'lucide-react';
import { JobRecord, LogLine } from '../types';

interface TerminalDrawerProps {
  job: JobRecord | null;
  isOpen: boolean;
  onClose: () => void;
  onAbort: (jobId: string) => void;
}

export const TerminalDrawer: React.FC<TerminalDrawerProps> = ({
  job,
  isOpen,
  onClose,
  onAbort,
}) => {
  const [filterText, setFilterText] = useState('');
  const [copied, setCopied] = useState(false);
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const logContainerRef = useRef<HTMLDivElement>(null);

  // Auto-scroll on new logs
  useEffect(() => {
    if (logContainerRef.current) {
      logContainerRef.current.scrollTop = logContainerRef.current.scrollHeight;
    }
  }, [job?.logs?.length]);

  // Elapsed timer while running
  useEffect(() => {
    if (!job || job.status !== 'RUNNING') {
      if (job?.duration_seconds) {
        setElapsedSeconds(job.duration_seconds);
      }
      return;
    }

    const start = new Date(job.started_at).getTime();
    const interval = setInterval(() => {
      setElapsedSeconds(parseFloat(((Date.now() - start) / 1000).toFixed(1)));
    }, 100);

    return () => clearInterval(interval);
  }, [job?.status, job?.started_at, job?.duration_seconds]);

  if (!isOpen || !job) return null;

  const isRunning = job.status === 'RUNNING';
  const isSuccess = job.status === 'SUCCESS';
  const isFailed = job.status === 'FAILED';
  const isAborted = job.status === 'ABORTED';

  const filteredLogs = job.logs.filter((line) => {
    if (!filterText.trim()) return true;
    return line.text.toLowerCase().includes(filterText.toLowerCase());
  });

  const handleCopyLogs = () => {
    const raw = job.logs.map((l) => `[${l.timestamp}] ${l.text}`).join('\n');
    navigator.clipboard.writeText(raw);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleDownloadLogs = () => {
    const raw = [
      `SWITCHR EXECUTION LOG - JOB ${job.job_id}`,
      `Host: ${job.host_name} (${job.host_id})`,
      `Service: ${job.service_name} (${job.service_id})`,
      `Target Profile: ${job.target_profile}`,
      `Status: ${job.status}`,
      `Started: ${job.started_at}`,
      `Completed: ${job.completed_at || 'In-Progress'}`,
      `Duration: ${job.duration_seconds || elapsedSeconds}s`,
      `Exit Code: ${job.exit_code ?? 'N/A'}`,
      `Verification Passed: ${job.verification_passed}`,
      `============================================================`,
      ...job.logs.map((l) => `[${l.timestamp}] ${l.text}`),
    ].join('\n');

    const blob = new Blob([raw], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `switchr_${job.job_id}_${job.service_id}.log`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="fixed inset-0 z-50 overflow-hidden bg-black/60 backdrop-blur-xs flex justify-end">
      <div className="w-full md:w-[760px] bg-[#070b14] border-l border-slate-800 flex flex-col h-full shadow-2xl animate-in slide-in-from-right duration-300">
        {/* Header Bar */}
        <div className="px-5 py-4 border-b border-slate-800 bg-[#0c1220] flex items-center justify-between gap-4">
          <div className="flex items-center gap-3 min-w-0">
            <div
              className={`w-3 h-3 rounded-full shrink-0 ${
                isRunning
                  ? 'bg-amber-400 animate-ping'
                  : isSuccess
                  ? 'bg-emerald-400'
                  : isFailed
                  ? 'bg-rose-500'
                  : 'bg-slate-500'
              }`}
            />
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <h2 className="text-sm font-display font-bold text-white tracking-tight truncate">
                  {job.service_name}
                </h2>
                <span className="text-xs font-mono text-slate-400">[{job.job_id}]</span>
              </div>
              <div className="text-xs text-slate-400 font-mono flex items-center gap-2 mt-0.5">
                <span>{job.host_name}</span>
                <span aria-hidden="true">·</span>
                <span className="text-sky-300">{job.target_profile}</span>
                <span aria-hidden="true">·</span>
                <span className="tabular-nums text-slate-300">{elapsedSeconds}s</span>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            {isRunning && (
              <button
                onClick={() => onAbort(job.job_id)}
                className="px-3 py-1.5 text-xs font-mono bg-rose-950/80 hover:bg-rose-900 border border-rose-800/80 text-rose-300 rounded transition-colors flex items-center gap-1.5 shadow-sm"
              >
                <Square className="w-3 h-3 fill-rose-300" />
                Abort Job
              </button>
            )}

            <button
              onClick={handleCopyLogs}
              title="Copy terminal logs"
              className="p-1.5 text-slate-400 hover:text-white bg-slate-900 border border-slate-800 rounded transition-colors"
            >
              {copied ? <Check className="w-4 h-4 text-emerald-400" /> : <Copy className="w-4 h-4" />}
            </button>

            <button
              onClick={handleDownloadLogs}
              title="Download full audit log"
              className="p-1.5 text-slate-400 hover:text-white bg-slate-900 border border-slate-800 rounded transition-colors"
            >
              <Download className="w-4 h-4" />
            </button>

            <button
              onClick={onClose}
              className="p-1.5 text-slate-400 hover:text-white transition-colors ml-1"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Console Subheader & Filter */}
        <div className="px-5 py-2.5 bg-slate-950/80 border-b border-slate-800/80 flex items-center justify-between gap-4 text-xs font-mono">
          <div className="flex items-center gap-3">
            <span
              className={`font-semibold ${
                isRunning
                  ? 'text-amber-400'
                  : isSuccess
                  ? 'text-emerald-400'
                  : isFailed
                  ? 'text-rose-400'
                  : 'text-slate-400'
              }`}
            >
              STATUS: {job.status}
            </span>
            <span className="text-slate-600">|</span>
            <span className="text-slate-400">Exit Code: {job.exit_code ?? 'running...'}</span>
            <span className="text-slate-600">|</span>
            <span className="text-slate-400">
              Probe: {job.verification_passed ? 'VERIFIED' : isRunning ? 'pending...' : 'FAILED'}
            </span>
          </div>

          <div className="relative max-w-[200px] w-full">
            <Search className="w-3.5 h-3.5 text-slate-500 absolute left-2 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={filterText}
              onChange={(e) => setFilterText(e.target.value)}
              placeholder="Filter logs..."
              className="w-full pl-7 pr-2 py-1 text-[11px] bg-slate-900 border border-slate-800 rounded text-slate-300 focus:outline-none focus:border-sky-500"
            />
          </div>
        </div>

        {/* Live Terminal Output Body */}
        <div
          ref={logContainerRef}
          className="flex-1 p-5 font-mono text-xs overflow-y-auto space-y-1 bg-[#050811] text-slate-300 select-text"
        >
          {filteredLogs.length === 0 ? (
            <div className="text-slate-600 italic py-6 text-center">
              No log lines matching filter.
            </div>
          ) : (
            filteredLogs.map((line) => {
              let colorClass = 'text-slate-300';
              if (line.type === 'stdout') colorClass = 'text-slate-300';
              else if (line.type === 'stderr' || line.type === 'error') colorClass = 'text-rose-400 font-semibold';
              else if (line.type === 'success') colorClass = 'text-emerald-400 font-semibold';
              else if (line.type === 'warn') colorClass = 'text-amber-400 font-semibold';
              else if (line.type === 'info') colorClass = 'text-sky-300';

              return (
                <div key={line.id} className="flex items-start gap-3 py-0.5 hover:bg-slate-900/40 rounded px-1 -mx-1">
                  <span className="text-slate-600 select-none shrink-0 tabular-nums text-[11px]">
                    {line.timestamp}
                  </span>
                  <span className={`break-all whitespace-pre-wrap leading-relaxed ${colorClass}`}>
                    {line.text}
                  </span>
                </div>
              );
            })
          )}
        </div>

        {/* Terminal Footer Status Bar */}
        <div className="px-5 py-2.5 bg-[#0c1220] border-t border-slate-800 flex items-center justify-between text-xs font-mono text-slate-400">
          <div className="flex items-center gap-2">
            <Terminal className="w-3.5 h-3.5 text-sky-400" />
            <span>SSE Stream Channel: <code className="text-sky-300">/api/jobs/{job.job_id}/stream</code></span>
          </div>
          <div className="tabular-nums">{job.logs.length} lines total</div>
        </div>
      </div>
    </div>
  );
};
