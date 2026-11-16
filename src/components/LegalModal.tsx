import React, { useEffect, useState } from 'react';
import { X, ShieldCheck, Scale, FileText, Lock, Building2 } from 'lucide-react';

export type LegalModalType = 'impressum' | 'privacy' | 'disclaimer' | 'trademarks' | null;

interface LegalModalProps {
  type: LegalModalType;
  onClose: () => void;
  onSelectTab?: (tab: 'impressum' | 'privacy' | 'disclaimer' | 'trademarks') => void;
}

interface TabDefinition {
  id: 'impressum' | 'privacy' | 'disclaimer' | 'trademarks';
  label: string;
  shortLabel: string;
  icon: React.ComponentType<{ className?: string }>;
}

const TABS: TabDefinition[] = [
  { id: 'impressum', label: 'Legal Notice', shortLabel: 'Impressum', icon: Building2 },
  { id: 'privacy', label: 'Privacy Policy', shortLabel: 'Privacy', icon: Lock },
  { id: 'disclaimer', label: 'Disclaimer', shortLabel: 'Disclaimer', icon: Scale },
  { id: 'trademarks', label: 'License & Trademarks', shortLabel: 'License', icon: FileText },
];

export const LegalModal: React.FC<LegalModalProps> = ({ type, onClose, onSelectTab }) => {
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
                Compliance & Legal Center
              </h2>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                MIT open-source license, self-hosted operator notices, liability & third-party trademarks
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            aria-label="Close dialog"
            className="p-1 rounded-md text-slate-400 hover:text-slate-700 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800/80 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* TabControl Navigation Strip */}
        <div className="px-6 bg-slate-100/70 dark:bg-slate-950/40 border-b border-slate-200 dark:border-slate-800">
          <nav
            role="tablist"
            aria-label="Legal Sections"
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
                  <span className="hidden sm:inline">{tab.label}</span>
                  <span className="sm:hidden">{tab.shortLabel}</span>
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
                Open-Source Software Attribution & Self-Hosted Deployment Notice:
              </div>

              <div>
                <h3 className="font-semibold text-slate-900 dark:text-white mb-1">Author & Official Project Repository:</h3>
                <p className="font-mono text-xs text-slate-700 dark:text-slate-300">
                  Author / Maintainer: Christian Leinen<br />
                  Email: <a href="mailto:christian@leinensoft.de" className="text-sky-600 dark:text-sky-400 underline hover:text-sky-500 dark:hover:text-sky-300">christian@leinensoft.de</a><br />
                  Website / Repository: <a href="https://github.com/ChristianLeinen/Switchr" target="_blank" rel="noopener noreferrer" className="text-sky-600 dark:text-sky-400 underline hover:text-sky-500 dark:hover:text-sky-300">https://github.com/ChristianLeinen/Switchr</a><br />
                  Germany / European Union
                </p>
              </div>

              <div>
                <h3 className="font-semibold text-slate-900 dark:text-white mb-1">Self-Hosted Instance Operator Responsibility:</h3>
                <p className="text-xs text-slate-700 dark:text-slate-300">
                  Switchr is distributed as free, open-source software and is not hosted or operated as a central service by the author. Whoever deploys and hosts this instance is solely responsible as its operator, including compliance with any applicable local legal or statutory notice requirements (such as § 5 DDG / § 18 MStV in Germany, where applicable).
                </p>
              </div>
            </div>
          )}

          {activeTab === 'privacy' && (
            <div className="space-y-4 animate-in fade-in-50 duration-150">
              <div className="p-3 rounded-lg bg-emerald-50 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-800/40 text-xs text-emerald-800 dark:text-emerald-200">
                Data Protection & Privacy Information for Self-Hosted Deployments (EU GDPR / DSGVO):
              </div>

              <div>
                <h3 className="font-semibold text-slate-900 dark:text-white mb-1">1. Data Controller</h3>
                <p className="text-xs text-slate-700 dark:text-slate-300">
                  Because Switchr runs entirely on self-hosted infrastructure, the organization or individual operating this deployed instance is the data controller within the meaning of the GDPR. The software author (Christian Leinen) does not host this application and receives no telemetry, usage data, or operational logs from it.
                </p>
              </div>

              <div>
                <h3 className="font-semibold text-slate-900 dark:text-white mb-1">2. Collection and Processing of Connection Data</h3>
                <p className="text-xs text-slate-700 dark:text-slate-300">
                  When accessing a self-hosted Switchr dashboard, standard HTTP server connection logs (such as IP address, access timestamp, and user agent) may be processed locally by the host infrastructure to ensure stable system operations and network security (Legal basis: Art. 6(1)(f) GDPR, where applicable).
                </p>
              </div>

              <div>
                <h3 className="font-semibold text-slate-900 dark:text-white mb-1">3. Orchestration & Execution Audit Logs</h3>
                <p className="text-xs text-slate-700 dark:text-slate-300">
                  Audit logs and transaction histories stored locally by Switchr record technical host state, remote script execution exit codes, and profile transition records for infrastructure maintenance purposes. No advertising trackers, third-party analytics cookies, external telemetry, or behavioral profiling are included in the software.
                </p>
              </div>

              <div>
                <h3 className="font-semibold text-slate-900 dark:text-white mb-1">4. Your Rights under GDPR</h3>
                <p className="text-xs text-slate-700 dark:text-slate-300">
                  Where the GDPR applies, you may exercise your rights regarding personal data—including access (Art. 15), rectification (Art. 16), erasure (Art. 17), restriction of processing (Art. 18), data portability (Art. 20), objection (Art. 21), and lodging a complaint with a supervisory authority (Art. 77)—directly with the operator of this Switchr instance.
                </p>
              </div>
            </div>
          )}

          {activeTab === 'disclaimer' && (
            <div className="space-y-4 animate-in fade-in-50 duration-150">
              <div className="p-3 rounded-lg bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800/40 text-xs text-amber-800 dark:text-amber-200">
                Warranty Disclaimer & Limitation of Liability (MIT License):
              </div>

              <div>
                <h3 className="font-semibold text-slate-900 dark:text-white mb-1">Software Provided &ldquo;As Is&rdquo;</h3>
                <p className="text-xs text-slate-700 dark:text-slate-300">
                  In accordance with the MIT License, Switchr is provided &ldquo;as is&rdquo;, without warranty of any kind, express or implied, including but not limited to the warranties of merchantability, fitness for a particular purpose, and noninfringement. In no event shall the authors or copyright holders be liable for any claim, damages, or other liability, whether in an action of contract, tort, or otherwise, arising from, out of, or in connection with the software or the use or other dealings in the software.
                </p>
              </div>

              <div>
                <h3 className="font-semibold text-slate-900 dark:text-white mb-1">Automation & Fail-Safe Invariants</h3>
                <p className="text-xs text-slate-700 dark:text-slate-300">
                  The Switchr application executes remote automation scripts and configuration profiles on target machines. All profile definitions and scripts must be thoroughly verified before deployment in production environments. Authors and contributors assume no liability for service downtime, data loss, or misconfigurations resulting from executed scripts or configurations.
                </p>
              </div>

              <div>
                <h3 className="font-semibold text-slate-900 dark:text-white mb-1">External Links</h3>
                <p className="text-xs text-slate-700 dark:text-slate-300">
                  Links to external resources (such as the project repository on GitHub) point to third-party platforms whose content and privacy practices are governed by their respective operators.
                </p>
              </div>
            </div>
          )}

          {activeTab === 'trademarks' && (
            <div className="space-y-4 animate-in fade-in-50 duration-150">
              <div className="p-3 rounded-lg bg-purple-50 dark:bg-purple-950/30 border border-purple-200 dark:border-purple-800/40 text-xs text-purple-800 dark:text-purple-200">
                MIT Open-Source License, Copyright & Third-Party Trademarks Notice:
              </div>

              <div>
                <h3 className="font-semibold text-slate-900 dark:text-white mb-1">Copyright & MIT License</h3>
                <p className="text-xs text-slate-700 dark:text-slate-300">
                  Copyright © {new Date().getFullYear()} Christian Leinen. Switchr is free and open-source software released under the <span className="font-semibold text-slate-900 dark:text-white">MIT License</span>. Permission is hereby granted, free of charge, to any person obtaining a copy of this software and associated documentation files to use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies of the software, subject to the conditions set forth in the <a href="https://github.com/ChristianLeinen/Switchr/blob/main/LICENSE" target="_blank" rel="noopener noreferrer" className="text-purple-600 dark:text-purple-400 underline hover:text-purple-500 dark:hover:text-purple-300">LICENSE</a> file in the official repository.
                </p>
              </div>

              <div>
                <h3 className="font-semibold text-slate-900 dark:text-white mb-1">Third-Party Trademarks</h3>
                <p className="text-xs text-slate-700 dark:text-slate-300">
                  All brand names and trademarks mentioned within this application (including Windows, WinRM, Microsoft Corporation, Linux, SSH, OpenSSH, Docker, systemd, PowerShell) are subject without restriction to the provisions of the respective trademark law and the ownership rights of their registered holders.
                </p>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-2">
                  The mere mentioning of trademarks does not imply that they are not protected by third-party rights, nor does it grant any license over third-party trademarks.
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
              MIT License ·{' '}
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
            Close
          </button>
        </div>
      </div>
    </div>
  );
};
