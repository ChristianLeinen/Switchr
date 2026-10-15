import React, { useState } from 'react';
import {
  FileText,
  Search,
  CheckCircle2,
  AlertTriangle,
  Clock,
  Download,
  Terminal,
  ExternalLink,
  Trash2,
} from 'lucide-react';
import { JobRecord } from '../types';

interface AuditHistoryViewProps {
  history: JobRecord[];
  onOpenLog: (job: JobRecord) => void;
  onClearHistory: () => void;
}

export const AuditHistoryView: React.FC<AuditHistoryViewProps> = ({
  history,
  onOpenLog,
  onClearHistory,
}) => {
  const [filterQuery, setFilterQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'SUCCESS' | 'FAILED' | 'ABORTED'>('all');

  const filteredHistory = history.filter((item) => {
    if (statusFilter !== 'all' && item.status !== statusFilter) return false;
    if (!filterQuery.trim()) return true;
    const q = filterQuery.toLowerCase();
    return (
      item.job_id.toLowerCase().includes(q) ||
      item.host_name.toLowerCase().includes(q) ||
      item.service_name.toLowerCase().includes(q) ||
      item.target_profile.toLowerCase().includes(q)
    );
  });

  const handleExportJson = () => {
    const dataStr = 'data:text/json;charset=utf-8,' + encodeURIComponent(JSON.stringify(history, null, 2));
    const downloadAnchor = document.createElement('a');
    downloadAnchor.setAttribute('href', dataStr);
    downloadAnchor.setAttribute('download', 'switchr_audit_history.json');
    document.body.appendChild(downloadAnchor);
    downloadAnchor.click();
    downloadAnchor.remove();
  };

  return (
    <div className="space-y-6">
      {/* Header Strip */}
      <div className="bg-[#0f172a] border border-slate-800 rounded-lg p-5 flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-display font-bold text-white tracking-tight">Audit Execution History</h1>
          <p className="text-sm text-slate-400 mt-1">
            Forensic execution records, exit codes, stdout/stderr streams, and probe results.
          </p>
        </div>

        <div className="flex items-center gap-3 shrink-0">
          <button
            onClick={handleExportJson}
            disabled={history.length === 0}
            className="px-3 py-1.5 text-xs font-medium bg-slate-800 hover:bg-slate-700 disabled:opacity-50 text-slate-200 border border-slate-700 rounded-md transition-colors flex items-center gap-1.5"
          >
            <Download className="w-3.5 h-3.5" />
            Export JSON
          </button>
          {history.length > 0 && (
            <button
              onClick={onClearHistory}
              className="px-3 py-1.5 text-xs font-medium text-slate-400 hover:text-rose-300 hover:bg-rose-950/30 rounded-md transition-colors flex items-center gap-1.5"
            >
              <Trash2 className="w-3.5 h-3.5" />
              Reset
            </button>
          )}
        </div>
      </div>

      {/* Filter Toolbar */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
        <div className="flex items-center gap-1 p-1 bg-slate-900 border border-slate-800 rounded-lg shrink-0">
          {(['all', 'SUCCESS', 'FAILED', 'ABORTED'] as const).map((st) => (
            <button
              key={st}
              onClick={() => setStatusFilter(st)}
              className={`px-3 py-1.5 text-xs font-medium rounded transition-colors ${
                statusFilter === st ? 'bg-sky-600 text-white font-semibold shadow-sm' : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              {st === 'all' ? `All (${history.length})` : st}
            </button>
          ))}
        </div>

        <div className="relative flex-1 sm:max-w-xs">
          <Search className="w-4 h-4 text-slate-500 absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            value={filterQuery}
            onChange={(e) => setFilterQuery(e.target.value)}
            placeholder="Search job, host, profile..."
            className="w-full pl-9 pr-3 py-1.5 text-xs bg-slate-900 border border-slate-800 rounded-lg text-slate-200 placeholder-slate-500 focus:outline-none focus:border-sky-500 font-mono"
          />
        </div>
      </div>

      {/* Audit Table */}
      <div className="bg-[#0c1220] border border-slate-800 rounded-lg overflow-hidden shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs font-mono text-slate-300">
            <thead className="bg-slate-900/90 text-slate-400 uppercase tracking-wider text-[11px] border-b border-slate-800">
              <tr>
                <th className="px-4 py-3.5">Started At</th>
                <th className="px-4 py-3.5">Job ID</th>
                <th className="px-4 py-3.5">Host / OS</th>
                <th className="px-4 py-3.5">Service</th>
                <th className="px-4 py-3.5">Transition Profile</th>
                <th className="px-4 py-3.5">Status</th>
                <th className="px-4 py-3.5">Duration</th>
                <th className="px-4 py-3.5">Probe</th>
                <th className="px-4 py-3.5 text-right">Terminal</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/70">
              {filteredHistory.length === 0 ? (
                <tr>
                  <td colSpan={9} className="px-4 py-12 text-center text-slate-500 italic">
                    No execution audit logs found.
                  </td>
                </tr>
              ) : (
                filteredHistory.map((rec) => {
                  const isSuccess = rec.status === 'SUCCESS';
                  const isFailed = rec.status === 'FAILED';
                  const isAborted = rec.status === 'ABORTED';
                  const dateStr = rec.started_at ? new Date(rec.started_at).toLocaleTimeString() : '-';

                  return (
                    <tr key={rec.job_id} className="hover:bg-slate-900/50 transition-colors">
                      <td className="px-4 py-3 tabular-nums text-slate-400">{dateStr}</td>
                      <td className="px-4 py-3 text-sky-400 font-bold">{rec.job_id}</td>
                      <td className="px-4 py-3 text-slate-200">
                        <div className="flex items-center gap-1.5">
                          <span
                            className={`text-[9px] px-1 py-0.2 rounded font-bold ${
                              rec.os_type === 'windows' ? 'bg-blue-950 text-blue-300' : 'bg-orange-950 text-orange-300'
                            }`}
                          >
                            {rec.os_type === 'windows' ? 'WIN' : 'NIX'}
                          </span>
                          <span className="truncate max-w-[140px]">{rec.host_name}</span>
                        </div>
                      </td>
                      <td className="px-4 py-3 text-slate-200 truncate max-w-[160px] font-medium">
                        {rec.service_name}
                      </td>
                      <td className="px-4 py-3 text-slate-300">
                        <span className="text-slate-500">{rec.previous_profile} &rarr; </span>
                        <span className="text-sky-300 font-bold">{rec.target_profile}</span>
                      </td>
                      <td className="px-4 py-3">
                        <span
                          className={`inline-flex items-center gap-1 font-semibold ${
                            isSuccess
                              ? 'text-emerald-400'
                              : isFailed
                              ? 'text-rose-400'
                              : isAborted
                              ? 'text-amber-400'
                              : 'text-slate-400'
                          }`}
                        >
                          {isSuccess && <CheckCircle2 className="w-3 h-3" />}
                          {isFailed && <AlertTriangle className="w-3 h-3" />}
                          {rec.status}
                          {rec.exit_code !== undefined && ` (${rec.exit_code})`}
                        </span>
                      </td>
                      <td className="px-4 py-3 tabular-nums text-slate-400">
                        {rec.duration_seconds !== undefined ? `${rec.duration_seconds.toFixed(1)}s` : '-'}
                      </td>
                      <td className="px-4 py-3">
                        <span className={rec.verification_passed ? 'text-emerald-400' : 'text-slate-500'}>
                          {rec.verification_passed ? 'PASSED' : 'FAILED / NONE'}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-right">
                        <button
                          onClick={() => onOpenLog(rec)}
                          className="px-2.5 py-1 text-xs text-sky-400 hover:text-sky-300 hover:bg-sky-950/40 border border-sky-900/60 rounded transition-colors inline-flex items-center gap-1"
                        >
                          <Terminal className="w-3 h-3" />
                          Logs
                        </button>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};
