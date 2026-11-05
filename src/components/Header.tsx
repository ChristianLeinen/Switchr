import React from 'react';
import { Layers, ShieldAlert, Cpu, Sun, Moon } from 'lucide-react';
import { ThemeMode } from '../hooks/useTheme';

interface HeaderProps {
  activeTab: 'fleet' | 'audit';
  onTabChange: (tab: 'fleet' | 'audit') => void;
  activeLocksCount: number;
  onSimulateConflict: () => void;
  theme: ThemeMode;
  onToggleTheme: () => void;
}

export const Header: React.FC<HeaderProps> = ({
  activeTab,
  onTabChange,
  activeLocksCount,
  onSimulateConflict,
  theme,
  onToggleTheme,
}) => {
  return (
    <header className="border-b border-slate-200 dark:border-slate-800/80 bg-white/95 dark:bg-[#070b14]/95 backdrop-blur sticky top-0 z-30 transition-colors duration-150">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between gap-6">
        {/* Zone 1: Brand Zone */}
        <div className="flex items-center gap-3 shrink-0">
          <div className="w-9 h-9 rounded-lg bg-slate-900 border border-slate-700/80 dark:border-slate-700 flex items-center justify-center shadow-sm overflow-hidden relative group">
            <img
              src="/icon.svg"
              alt="Switchr Icon"
              className="w-full h-full object-contain p-1"
              onError={(e) => {
                const target = e.currentTarget;
                if (!target.dataset.triedPng) {
                  target.dataset.triedPng = 'true';
                  target.src = '/icon.png';
                } else {
                  target.style.display = 'none';
                  const fallback = target.nextElementSibling as HTMLElement;
                  if (fallback) fallback.style.display = 'flex';
                }
              }}
            />
            <div style={{ display: 'none' }} className="w-full h-full items-center justify-center">
              <Layers className="w-5 h-5 text-sky-400" />
            </div>
          </div>
          <div className="flex items-baseline gap-2">
            <span className="font-display text-lg font-bold tracking-tight text-slate-900 dark:text-white">Switchr</span>
            <span className="text-[11px] font-mono text-slate-500 dark:text-slate-400">v1.0.0</span>
          </div>
        </div>

        {/* Zone 2: Nav Links */}
        <nav className="hidden md:flex items-center gap-8 text-sm font-medium">
          <button
            onClick={() => onTabChange('fleet')}
            className={`whitespace-nowrap pb-0.5 border-b-2 transition-colors ${
              activeTab === 'fleet'
                ? 'border-sky-500 text-sky-600 dark:text-white font-semibold'
                : 'border-transparent text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
            }`}
          >
            Fleet & Services
          </button>
          <button
            onClick={() => onTabChange('audit')}
            className={`whitespace-nowrap pb-0.5 border-b-2 transition-colors ${
              activeTab === 'audit'
                ? 'border-sky-500 text-sky-600 dark:text-white font-semibold'
                : 'border-transparent text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
            }`}
          >
            Audit History
          </button>
        </nav>

        {/* Zone 3: Primary Actions, Telemetry & Theme Toggle */}
        <div className="flex items-center gap-3 shrink-0">
          {/* Telemetry Badges */}
          <div className="flex items-center gap-2 text-xs font-mono">
            <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded bg-amber-50 dark:bg-slate-900 border border-amber-300/80 dark:border-slate-800 text-[11px] text-amber-700 dark:text-amber-400 font-medium">
              <Cpu className="w-3 h-3 text-amber-600 dark:text-amber-400" />
              DRY_RUN=True
            </span>
            {activeLocksCount > 0 && (
              <span className="inline-flex items-center gap-1 text-[11px] text-amber-600 dark:text-amber-400 font-mono font-medium">
                <span className="w-2 h-2 rounded-full bg-amber-500 animate-ping"></span>
                {activeLocksCount} lock{activeLocksCount > 1 ? 's' : ''}
              </span>
            )}
          </div>

          {/* Test 409 Lock button */}
          <button
            onClick={onSimulateConflict}
            title="Test 409 Conflict rejection by triggering concurrent switches on the same service"
            className="hidden sm:inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-mono text-amber-800 dark:text-amber-300 hover:text-amber-900 dark:hover:text-amber-200 bg-amber-100/80 dark:bg-amber-950/40 hover:bg-amber-200 dark:hover:bg-amber-950/70 border border-amber-300 dark:border-amber-700/60 rounded-md transition-colors whitespace-nowrap"
          >
            <ShieldAlert className="w-3.5 h-3.5" />
            Test 409 Lock
          </button>

          {/* Dark / Light Mode Toggle Button */}
          <button
            onClick={onToggleTheme}
            aria-label={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
            title={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
            className="p-1.5 rounded-lg border border-slate-300 dark:border-slate-700 bg-slate-100 hover:bg-slate-200 dark:bg-slate-800/80 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 transition-colors shadow-sm focus:outline-none focus:ring-2 focus:ring-sky-500"
          >
            {theme === 'dark' ? (
              <Sun className="w-4 h-4 text-amber-400 transition-transform duration-200 hover:rotate-45" />
            ) : (
              <Moon className="w-4 h-4 text-slate-700 transition-transform duration-200 hover:-rotate-12" />
            )}
          </button>
        </div>
      </div>
    </header>
  );
};
