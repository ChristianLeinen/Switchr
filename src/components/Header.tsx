import React from 'react';
import { Layers, Terminal, ShieldAlert, Cpu } from 'lucide-react';

interface HeaderProps {
  activeTab: 'fleet' | 'audit';
  onTabChange: (tab: 'fleet' | 'audit') => void;
  activeLocksCount: number;
  onSimulateConflict: () => void;
}

export const Header: React.FC<HeaderProps> = ({
  activeTab,
  onTabChange,
  activeLocksCount,
  onSimulateConflict,
}) => {
  return (
    <header className="border-b border-slate-800/80 bg-[#070b14]/95 backdrop-blur sticky top-0 z-30">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between gap-8">
        {/* Zone 1: Brand Zone */}
        <div className="flex items-center gap-3 shrink-0">
          <div className="w-9 h-9 rounded-lg bg-gradient-to-br from-sky-500 to-blue-700 flex items-center justify-center text-white shadow-md shadow-sky-950/40">
            <Layers className="w-5 h-5" />
          </div>
          <div className="flex items-baseline gap-2">
            <span className="font-display text-lg font-bold tracking-tight text-white">Switchr</span>
            <span className="text-[11px] font-mono text-slate-500">v1.0.0</span>
          </div>
        </div>

        {/* Zone 2: Nav Links */}
        <nav className="hidden md:flex items-center gap-8 text-sm font-medium">
          <button
            onClick={() => onTabChange('fleet')}
            className={`whitespace-nowrap pb-0.5 border-b-2 transition-colors ${
              activeTab === 'fleet'
                ? 'border-sky-500 text-white font-semibold'
                : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            Fleet & Services
          </button>
          <button
            onClick={() => onTabChange('audit')}
            className={`whitespace-nowrap pb-0.5 border-b-2 transition-colors ${
              activeTab === 'audit'
                ? 'border-sky-500 text-white font-semibold'
                : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            Audit History
          </button>
        </nav>

        {/* Zone 3: Primary Actions & Telemetry */}
        <div className="flex items-center gap-3 shrink-0">
          <div className="flex items-center gap-2 text-xs font-mono text-slate-400">
            <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded bg-slate-900 border border-slate-800 text-[11px] text-amber-400">
              <Cpu className="w-3 h-3 text-amber-400" />
              DRY_RUN=True
            </span>
            {activeLocksCount > 0 && (
              <span className="inline-flex items-center gap-1 text-[11px] text-amber-400 font-mono">
                <span className="w-2 h-2 rounded-full bg-amber-400 animate-ping"></span>
                {activeLocksCount} lock{activeLocksCount > 1 ? 's' : ''}
              </span>
            )}
          </div>

          <button
            onClick={onSimulateConflict}
            title="Test 409 Conflict rejection by triggering concurrent switches on the same service"
            className="hidden sm:inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-mono text-amber-300 hover:text-amber-200 bg-amber-950/40 hover:bg-amber-950/70 border border-amber-700/60 rounded-md transition-colors whitespace-nowrap"
          >
            <ShieldAlert className="w-3.5 h-3.5" />
            Test 409 Lock
          </button>
        </div>
      </div>
    </header>
  );
};
