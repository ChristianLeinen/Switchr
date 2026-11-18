import React from 'react';
import { ShieldCheck, Scale, Lock, FileText, Building2 } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { LegalModalType } from './LegalModal';

interface FooterProps {
  onOpenLegal: (type: LegalModalType) => void;
}

export const Footer: React.FC<FooterProps> = ({ onOpenLegal }) => {
  const { t } = useTranslation('Footer');
  const currentYear = new Date().getFullYear();

  return (
    <footer className="mt-auto border-t border-slate-200 dark:border-slate-800/80 bg-white/95 dark:bg-[#060911]/95 text-slate-500 dark:text-slate-400 text-xs transition-colors duration-150">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
        <div className="flex flex-col md:flex-row items-center justify-between gap-4">
          {/* Copyright & Brand */}
          <div className="flex flex-col sm:flex-row items-center gap-2 sm:gap-3 text-center sm:text-left">
            <span className="text-slate-800 dark:text-slate-300 font-medium">
              {t('brand.copyright', { year: currentYear })}
            </span>
            <span className="hidden sm:inline text-slate-300 dark:text-slate-600">|</span>
            <span className="text-slate-600 dark:text-slate-400 text-[11px] flex items-center gap-1">
              <ShieldCheck className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" />
              {t('brand.engineeredInEu')}
            </span>
          </div>

          {/* Legal Hyperlinks */}
          <nav aria-label={t('nav.ariaLabel')} className="flex flex-wrap items-center justify-center gap-x-5 gap-y-2 text-xs">
            <button
              onClick={() => onOpenLegal('impressum')}
              className="inline-flex items-center gap-1.5 text-slate-600 dark:text-slate-400 hover:text-sky-600 dark:hover:text-sky-400 transition-colors underline-offset-4 hover:underline"
            >
              <Building2 className="w-3.5 h-3.5 text-sky-600/80 dark:text-sky-400/80" />
              <span>{t('nav.legalNotice')}</span>
            </button>

            <span className="text-slate-300 dark:text-slate-700">·</span>

            <button
              onClick={() => onOpenLegal('privacy')}
              className="inline-flex items-center gap-1.5 text-slate-600 dark:text-slate-400 hover:text-emerald-600 dark:hover:text-emerald-400 transition-colors underline-offset-4 hover:underline"
            >
              <Lock className="w-3.5 h-3.5 text-emerald-600/80 dark:text-emerald-400/80" />
              <span>{t('nav.privacyPolicy')}</span>
            </button>

            <span className="text-slate-300 dark:text-slate-700">·</span>

            <button
              onClick={() => onOpenLegal('disclaimer')}
              className="inline-flex items-center gap-1.5 text-slate-600 dark:text-slate-400 hover:text-amber-600 dark:hover:text-amber-400 transition-colors underline-offset-4 hover:underline"
            >
              <Scale className="w-3.5 h-3.5 text-amber-600/80 dark:text-amber-400/80" />
              <span>{t('nav.disclaimer')}</span>
            </button>

            <span className="text-slate-300 dark:text-slate-700">·</span>

            <button
              onClick={() => onOpenLegal('trademarks')}
              className="inline-flex items-center gap-1.5 text-slate-600 dark:text-slate-400 hover:text-purple-600 dark:hover:text-purple-400 transition-colors underline-offset-4 hover:underline"
            >
              <FileText className="w-3.5 h-3.5 text-purple-600/80 dark:text-purple-400/80" />
              <span>{t('nav.licenseTrademarks')}</span>
            </button>
          </nav>
        </div>
      </div>
    </footer>
  );
};
