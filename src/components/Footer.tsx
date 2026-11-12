import React from 'react';
import { ShieldCheck, Scale, Lock, FileText, Building2 } from 'lucide-react';
import { LegalModalType } from './LegalModal';

interface FooterProps {
  onOpenLegal: (type: LegalModalType) => void;
}

export const Footer: React.FC<FooterProps> = ({ onOpenLegal }) => {
  const currentYear = new Date().getFullYear();

  return (
    <footer className="mt-auto border-t border-slate-200 dark:border-slate-800/80 bg-white/95 dark:bg-[#060911]/95 text-slate-500 dark:text-slate-400 text-xs transition-colors duration-150">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
        <div className="flex flex-col md:flex-row items-center justify-between gap-4">
          {/* Copyright & Brand */}
          <div className="flex flex-col sm:flex-row items-center gap-2 sm:gap-3 text-center sm:text-left">
            <span className="text-slate-800 dark:text-slate-300 font-medium">
              © {currentYear} Christian Leinen. All rights reserved.
            </span>
            <span className="hidden sm:inline text-slate-300 dark:text-slate-600">|</span>
            <span className="text-slate-600 dark:text-slate-400 text-[11px] flex items-center gap-1">
              <ShieldCheck className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" />
              Engineered in the European Union
            </span>
          </div>

          {/* Legal Hyperlinks */}
          <nav aria-label="Legal Information" className="flex flex-wrap items-center justify-center gap-x-5 gap-y-2 text-xs">
            <button
              onClick={() => onOpenLegal('impressum')}
              className="inline-flex items-center gap-1.5 text-slate-600 dark:text-slate-400 hover:text-sky-600 dark:hover:text-sky-400 transition-colors underline-offset-4 hover:underline"
            >
              <Building2 className="w-3.5 h-3.5 text-sky-600/80 dark:text-sky-400/80" />
              <span>Legal Notice</span>
            </button>

            <span className="text-slate-300 dark:text-slate-700">·</span>

            <button
              onClick={() => onOpenLegal('privacy')}
              className="inline-flex items-center gap-1.5 text-slate-600 dark:text-slate-400 hover:text-emerald-600 dark:hover:text-emerald-400 transition-colors underline-offset-4 hover:underline"
            >
              <Lock className="w-3.5 h-3.5 text-emerald-600/80 dark:text-emerald-400/80" />
              <span>Privacy Policy</span>
            </button>

            <span className="text-slate-300 dark:text-slate-700">·</span>

            <button
              onClick={() => onOpenLegal('disclaimer')}
              className="inline-flex items-center gap-1.5 text-slate-600 dark:text-slate-400 hover:text-amber-600 dark:hover:text-amber-400 transition-colors underline-offset-4 hover:underline"
            >
              <Scale className="w-3.5 h-3.5 text-amber-600/80 dark:text-amber-400/80" />
              <span>Disclaimer</span>
            </button>

            <span className="text-slate-300 dark:text-slate-700">·</span>

            <button
              onClick={() => onOpenLegal('trademarks')}
              className="inline-flex items-center gap-1.5 text-slate-600 dark:text-slate-400 hover:text-purple-600 dark:hover:text-purple-400 transition-colors underline-offset-4 hover:underline"
            >
              <FileText className="w-3.5 h-3.5 text-purple-600/80 dark:text-purple-400/80" />
              <span>Trademarks & Copyright</span>
            </button>
          </nav>
        </div>

        {/* Micro-subline explaining compliance */}
        <div className="mt-3 pt-3 border-t border-slate-200 dark:border-slate-900/80 flex flex-col sm:flex-row items-center justify-between gap-2 text-[10px] text-slate-400 dark:text-slate-500 font-mono">
          <span>Compliant with TMG (§ 5), MStV (§ 18), EU GDPR & Digital Services Act specifications.</span>
          <span>Switchr Orchestration Engine v1.0.0</span>
        </div>
      </div>
    </footer>
  );
};
