import React, { useEffect, useState } from 'react';
import { X, ShieldCheck, Scale, FileText, Lock, Building2 } from 'lucide-react';
import { Trans, useTranslation } from 'react-i18next';

export type LegalModalType = 'impressum' | 'privacy' | 'disclaimer' | 'trademarks' | null;

interface LegalModalProps {
  type: LegalModalType;
  onClose: () => void;
  onSelectTab?: (tab: 'impressum' | 'privacy' | 'disclaimer' | 'trademarks') => void;
}

interface TabDefinition {
  id: 'impressum' | 'privacy' | 'disclaimer' | 'trademarks';
  icon: React.ComponentType<{ className?: string }>;
}

const TABS: TabDefinition[] = [
  { id: 'impressum', icon: Building2 },
  { id: 'privacy', icon: Lock },
  { id: 'disclaimer', icon: Scale },
  { id: 'trademarks', icon: FileText },
];

export const LegalModal: React.FC<LegalModalProps> = ({ type, onClose, onSelectTab }) => {
  const { t } = useTranslation('LegalModal');
  const [activeTab, setActiveTab] = useState<'impressum' | 'privacy' | 'disclaimer' | 'trademarks'>('impressum');

  // Synchronize internal active tab whenever the modal is triggered with a specific type from outside
  useEffect(() => {
    if (type) {
      setActiveTab(type);
    }
  }, [type]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    if (type) {
      window.addEventListener('keydown', handleKeyDown);
      document.body.style.overflow = 'hidden';
    }
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      document.body.style.overflow = 'unset';
    };
  }, [type, onClose]);

  if (!type) return null;

  const handleTabClick = (tabId: 'impressum' | 'privacy' | 'disclaimer' | 'trademarks') => {
    setActiveTab(tabId);
    if (onSelectTab) onSelectTab(tabId);
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="legal-modal-title"
      className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-6 bg-black/75 backdrop-blur-sm animate-in fade-in duration-150"
      onClick={onClose}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-2xl max-h-[85vh] flex flex-col rounded-xl border border-slate-200 dark:border-slate-700/80 bg-white dark:bg-slate-900/95 shadow-2xl shadow-black/80 text-slate-800 dark:text-slate-200 overflow-hidden transition-colors duration-150"
      >
        {/* Header Bar */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950/60">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-sky-100 dark:bg-sky-950/60 border border-sky-300 dark:border-sky-800/60 text-sky-600 dark:text-sky-400 flex items-center justify-center">
              <Scale className="w-4 h-4" />
            </div>
            <div>
              <h2 id="legal-modal-title" className="text-base font-semibold text-slate-900 dark:text-white tracking-wide">
                {t('header.title')}
              </h2>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                {t('header.subtitle')}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            aria-label={t('header.closeAriaLabel')}
            className="p-1 rounded-md text-slate-400 hover:text-slate-700 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800/80 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* TabControl Navigation Strip */}
        <div className="px-6 bg-slate-100/70 dark:bg-slate-950/40 border-b border-slate-200 dark:border-slate-800">
          <nav
            role="tablist"
            aria-label={t('tabs.ariaLabel')}
            className="flex items-center space-x-1 sm:space-x-2 overflow-x-auto scrollbar-none py-1.5"
          >
            {TABS.map((tab) => {
              const Icon = tab.icon;
              const isActive = activeTab === tab.id;
              return (
                <button
                  key={tab.id}
                  role="tab"
                  id={`tab-${tab.id}`}
                  aria-selected={isActive}
                  aria-controls={`tabpanel-${tab.id}`}
                  onClick={() => handleTabClick(tab.id)}
                  className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg transition-all whitespace-nowrap ${
                    isActive
                      ? 'bg-white dark:bg-slate-800 text-sky-600 dark:text-white shadow-sm border border-slate-200 dark:border-slate-700'
                      : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200 hover:bg-slate-200/60 dark:hover:bg-slate-800/40'
                  }`}
                >
                  <Icon
                    className={`w-3.5 h-3.5 ${
                      isActive
                        ? tab.id === 'impressum'
                          ? 'text-sky-600 dark:text-sky-400'
                          : tab.id === 'privacy'
                          ? 'text-emerald-600 dark:text-emerald-400'
                          : tab.id === 'disclaimer'
                          ? 'text-amber-600 dark:text-amber-400'
                          : 'text-purple-600 dark:text-purple-400'
                        : 'text-slate-400'
                    }`}
                  />
                  <span className="hidden sm:inline">{t(`tabs.${tab.id}Label`)}</span>
                  <span className="sm:hidden">{t(`tabs.${tab.id}Short`)}</span>
                </button>
              );
            })}
          </nav>
        </div>

        {/* Tab Content Body */}
        <div
          role="tabpanel"
          id={`tabpanel-${activeTab}`}
          aria-labelledby={`tab-${activeTab}`}
          className="flex-1 overflow-y-auto px-6 py-5 text-sm text-slate-600 dark:text-slate-300 space-y-5 leading-relaxed font-sans"
        >
          {activeTab === 'impressum' && (
            <div className="space-y-4 animate-in fade-in-50 duration-150">
              <div className="p-3 rounded-lg bg-sky-50 dark:bg-sky-950/30 border border-sky-200 dark:border-sky-800/40 text-xs text-sky-800 dark:text-sky-200">
                {t('impressum.banner')}
              </div>

              <div>
                <h3 className="font-semibold text-slate-900 dark:text-white mb-1">{t('impressum.authorHeading')}</h3>
                <p className="font-mono text-xs text-slate-700 dark:text-slate-300">
                  {t('impressum.authorLine')}<br />
                  {t('impressum.emailLabel')} <a href="mailto:christian@leinensoft.de" className="text-sky-600 dark:text-sky-400 underline hover:text-sky-500 dark:hover:text-sky-300">christian@leinensoft.de</a><br />
                  {t('impressum.websiteLabel')} <a href="https://github.com/ChristianLeinen/Switchr" target="_blank" rel="noopener noreferrer" className="text-sky-600 dark:text-sky-400 underline hover:text-sky-500 dark:hover:text-sky-300">https://github.com/ChristianLeinen/Switchr</a><br />
                  {t('impressum.regionLine')}
                </p>
              </div>

              <div>
                <h3 className="font-semibold text-slate-900 dark:text-white mb-1">{t('impressum.operatorHeading')}</h3>
                <p className="text-xs text-slate-700 dark:text-slate-300">
                  {t('impressum.operatorBody')}
                </p>
              </div>
            </div>
          )}

          {activeTab === 'privacy' && (
            <div className="space-y-4 animate-in fade-in-50 duration-150">
              <div className="p-3 rounded-lg bg-emerald-50 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-800/40 text-xs text-emerald-800 dark:text-emerald-200">
                {t('privacy.banner')}
              </div>

              <div>
                <h3 className="font-semibold text-slate-900 dark:text-white mb-1">{t('privacy.controllerHeading')}</h3>
                <p className="text-xs text-slate-700 dark:text-slate-300">
                  {t('privacy.controllerBody')}
                </p>
              </div>

              <div>
                <h3 className="font-semibold text-slate-900 dark:text-white mb-1">{t('privacy.connectionHeading')}</h3>
                <p className="text-xs text-slate-700 dark:text-slate-300">
                  {t('privacy.connectionBody')}
                </p>
              </div>

              <div>
                <h3 className="font-semibold text-slate-900 dark:text-white mb-1">{t('privacy.auditHeading')}</h3>
                <p className="text-xs text-slate-700 dark:text-slate-300">
                  {t('privacy.auditBody')}
                </p>
              </div>

              <div>
                <h3 className="font-semibold text-slate-900 dark:text-white mb-1">{t('privacy.rightsHeading')}</h3>
                <p className="text-xs text-slate-700 dark:text-slate-300">
                  {t('privacy.rightsBody')}
                </p>
              </div>
            </div>
          )}

          {activeTab === 'disclaimer' && (
            <div className="space-y-4 animate-in fade-in-50 duration-150">
              <div className="p-3 rounded-lg bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800/40 text-xs text-amber-800 dark:text-amber-200">
                {t('disclaimer.banner')}
              </div>

              <div>
                <h3 className="font-semibold text-slate-900 dark:text-white mb-1">{t('disclaimer.asIsHeading')}</h3>
                <p className="text-xs text-slate-700 dark:text-slate-300">
                  {t('disclaimer.asIsBody')}
                </p>
              </div>

              <div>
                <h3 className="font-semibold text-slate-900 dark:text-white mb-1">{t('disclaimer.automationHeading')}</h3>
                <p className="text-xs text-slate-700 dark:text-slate-300">
                  {t('disclaimer.automationBody')}
                </p>
              </div>

              <div>
                <h3 className="font-semibold text-slate-900 dark:text-white mb-1">{t('disclaimer.linksHeading')}</h3>
                <p className="text-xs text-slate-700 dark:text-slate-300">
                  {t('disclaimer.linksBody')}
                </p>
              </div>
            </div>
          )}

          {activeTab === 'trademarks' && (
            <div className="space-y-4 animate-in fade-in-50 duration-150">
              <div className="p-3 rounded-lg bg-purple-50 dark:bg-purple-950/30 border border-purple-200 dark:border-purple-800/40 text-xs text-purple-800 dark:text-purple-200">
                {t('trademarks.banner')}
              </div>

              <div>
                <h3 className="font-semibold text-slate-900 dark:text-white mb-1">{t('trademarks.licenseHeading')}</h3>
                <p className="text-xs text-slate-700 dark:text-slate-300">
                  <Trans
                    t={t}
                    i18nKey="trademarks.licenseBody"
                    values={{ year: new Date().getFullYear() }}
                    components={{
                      license: <span className="font-semibold text-slate-900 dark:text-white" />,
                      link: (
                        <a
                          href="https://github.com/ChristianLeinen/Switchr/blob/main/LICENSE"
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-purple-600 dark:text-purple-400 underline hover:text-purple-500 dark:hover:text-purple-300"
                        />
                      ),
                    }}
                  />
                </p>
              </div>

              <div>
                <h3 className="font-semibold text-slate-900 dark:text-white mb-1">{t('trademarks.thirdPartyHeading')}</h3>
                <p className="text-xs text-slate-700 dark:text-slate-300">
                  {t('trademarks.thirdPartyBody')}
                </p>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-2">
                  {t('trademarks.thirdPartyNote')}
                </p>
              </div>
            </div>
          )}
        </div>

        {/* Footer actions */}
        <div className="px-6 py-3 border-t border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950/80 flex items-center justify-between">
          <div className="flex items-center gap-1.5 text-xs text-slate-500 dark:text-slate-400">
            <ShieldCheck className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" />
            <span>
              {t('footer.mitLabel')} ·{' '}
              <a
                href="https://github.com/ChristianLeinen/Switchr"
                target="_blank"
                rel="noopener noreferrer"
                className="underline hover:text-slate-700 dark:hover:text-slate-200 transition-colors"
              >
                github.com/ChristianLeinen/Switchr
              </a>
            </span>
          </div>
          <button
            onClick={onClose}
            className="px-4 py-1.5 text-xs font-medium rounded-md bg-slate-200 hover:bg-slate-300 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-800 dark:text-white transition-colors"
          >
            {t('footer.closeButton')}
          </button>
        </div>
      </div>
    </div>
  );
};
