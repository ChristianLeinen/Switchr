import React from 'react';
import { Layers, ShieldAlert, Cpu, Sun, Moon } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { ThemeMode } from '../hooks/useTheme';
import { SUPPORTED_LANGUAGES, SupportedLanguageCode, normalizeLanguageCode } from '../i18n';
import { formatLocaleNumber } from '../utils/intlFormat';

interface HeaderProps {
  activeTab: 'fleet' | 'audit';
  onTabChange: (tab: 'fleet' | 'audit') => void;
  activeLocksCount: number;
  dryRun: boolean;
  onSimulateConflict: () => void;
  theme: ThemeMode;
  onToggleTheme: () => void;
}

export const Header: React.FC<HeaderProps> = ({
  activeTab,
  onTabChange,
  activeLocksCount,
  dryRun,
  onSimulateConflict,
  theme,
  onToggleTheme,
}) => {
  const { t, i18n } = useTranslation('Header');
  const currentLang = normalizeLanguageCode(i18n.resolvedLanguage || i18n.language);

  const handleLanguageChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    void i18n.changeLanguage(e.target.value as SupportedLanguageCode);
  };

  return (
    <header className="border-b border-slate-200 dark:border-slate-800/80 bg-white/95 dark:bg-[#070b14]/95 backdrop-blur sticky top-0 z-30 transition-colors duration-150">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between gap-6">
        {/* Zone 1: Brand Zone */}
        <div className="flex items-center gap-3 shrink-0">
          <div className="w-9 h-9 rounded-lg bg-slate-900 border border-slate-700/80 dark:border-slate-700 flex items-center justify-center shadow-sm overflow-hidden relative group">
            <img
              src="/icon.png"
              alt={t('brand.iconAlt')}
              className="w-full h-full object-contain p-1"
              onError={(e) => {
                const target = e.currentTarget;
                target.style.display = 'none';
                const fallback = target.nextElementSibling as HTMLElement;
                if (fallback) fallback.style.display = 'flex';
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
        <nav aria-label={t('nav.ariaLabel')} className="hidden md:flex items-center gap-8 text-sm font-medium">
          <button
            onClick={() => onTabChange('fleet')}
            className={`whitespace-nowrap pb-0.5 border-b-2 transition-colors ${
              activeTab === 'fleet'
                ? 'border-sky-500 text-sky-600 dark:text-white font-semibold'
                : 'border-transparent text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
            }`}
          >
            {t('nav.fleet')}
          </button>
          <button
            onClick={() => onTabChange('audit')}
            className={`whitespace-nowrap pb-0.5 border-b-2 transition-colors ${
              activeTab === 'audit'
                ? 'border-sky-500 text-sky-600 dark:text-white font-semibold'
                : 'border-transparent text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
            }`}
          >
            {t('nav.audit')}
          </button>
        </nav>

        {/* Zone 3: Primary Actions, Telemetry, Language & Theme Toggle */}
        <div className="flex items-center gap-3 shrink-0">
          {/* Telemetry Badges */}
          {(dryRun || activeLocksCount > 0) && (
            <div className="flex items-center gap-2 text-xs font-mono">
              {dryRun && (
                <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded bg-amber-50 dark:bg-slate-900 border border-amber-300/80 dark:border-slate-800 text-[11px] text-amber-700 dark:text-amber-400 font-medium">
                  <Cpu className="w-3 h-3 text-amber-600 dark:text-amber-400" />
                  DRY_RUN=True
                </span>
              )}
              {activeLocksCount > 0 && (
                <span className="inline-flex items-center gap-1 text-[11px] text-amber-600 dark:text-amber-400 font-mono font-medium">
                  <span className="w-2 h-2 rounded-full bg-amber-500 animate-ping"></span>
                  {t('telemetry.locks', {
                    count: activeLocksCount,
                    formattedCount: formatLocaleNumber(activeLocksCount, currentLang),
                  })}
                </span>
              )}
            </div>
          )}

          {/* Test 409 Lock button (only shown in dry-run mode) */}
          {dryRun && (
            <button
              onClick={onSimulateConflict}
              title={t('actions.testConflictTitle')}
              className="hidden sm:inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-mono text-amber-800 dark:text-amber-300 hover:text-amber-900 dark:hover:text-amber-200 bg-amber-100/80 dark:bg-amber-950/40 hover:bg-amber-200 dark:hover:bg-amber-950/70 border border-amber-300 dark:border-amber-700/60 rounded-md transition-colors whitespace-nowrap"
            >
              <ShieldAlert className="w-3.5 h-3.5" />
              {t('actions.testConflictButton')}
            </button>
          )}

          {/* Language Selector Dropdown */}
          <select
            value={currentLang}
            onChange={handleLanguageChange}
            aria-label={t('language.ariaLabel')}
            title={t('language.title')}
            className="text-xs leading-4 font-medium px-2.5 py-1.5 bg-slate-100 hover:bg-slate-200 dark:bg-slate-800/80 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 border border-slate-300 dark:border-slate-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-sky-500 transition-colors shadow-sm cursor-pointer max-w-[140px] sm:max-w-none"
          >
            {(Object.entries(SUPPORTED_LANGUAGES) as [SupportedLanguageCode, string][]).map(([code, label]) => (
              <option key={code} value={code}>
                {label}
              </option>
            ))}
          </select>

          {/* Dark / Light Mode Toggle Button */}
          <button
            onClick={onToggleTheme}
            aria-label={theme === 'dark' ? t('theme.switchToLight') : t('theme.switchToDark')}
            title={theme === 'dark' ? t('theme.switchToLight') : t('theme.switchToDark')}
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
