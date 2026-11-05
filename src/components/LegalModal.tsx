import React, { useEffect } from 'react';
import { X, ShieldCheck, Scale, FileText, Lock, Building2 } from 'lucide-react';

export type LegalModalType = 'impressum' | 'privacy' | 'disclaimer' | 'trademarks' | null;

interface LegalModalProps {
  type: LegalModalType;
  onClose: () => void;
}

export const LegalModal: React.FC<LegalModalProps> = ({ type, onClose }) => {
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

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="legal-modal-title"
      className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-6 bg-black/80 backdrop-blur-sm animate-in fade-in duration-150"
      onClick={onClose}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-2xl max-h-[85vh] flex flex-col rounded-xl border border-slate-700/80 bg-slate-900/95 shadow-2xl shadow-black/80 text-slate-200 overflow-hidden"
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-800 bg-slate-950/60">
          <div className="flex items-center gap-3">
            {type === 'impressum' && <Building2 className="w-5 h-5 text-sky-400" />}
            {type === 'privacy' && <Lock className="w-5 h-5 text-emerald-400" />}
            {type === 'disclaimer' && <Scale className="w-5 h-5 text-amber-400" />}
            {type === 'trademarks' && <FileText className="w-5 h-5 text-purple-400" />}
            <h2 id="legal-modal-title" className="text-base font-semibold text-white tracking-wide">
              {type === 'impressum' && 'Legal Notice (Impressum)'}
              {type === 'privacy' && 'Privacy Policy (GDPR / DSGVO)'}
              {type === 'disclaimer' && 'Legal Disclaimer'}
              {type === 'trademarks' && 'Trademarks & Copyright Notice'}
            </h2>
          </div>
          <button
            onClick={onClose}
            aria-label="Close dialog"
            className="p-1 rounded-md text-slate-400 hover:text-white hover:bg-slate-800/80 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content Body */}
        <div className="flex-1 overflow-y-auto px-6 py-5 text-sm text-slate-300 space-y-5 leading-relaxed font-sans">
          {type === 'impressum' && (
            <div className="space-y-4">
              <div className="p-3 rounded-lg bg-sky-950/30 border border-sky-800/40 text-xs text-sky-200">
                Information pursuant to § 5 of the German Telemedia Act (TMG) and § 18 Section 2 of the German Interstate Media Treaty (MStV):
              </div>

              <div>
                <h3 className="font-semibold text-white mb-1">Service Provider / Operator:</h3>
                <p className="font-mono text-xs text-slate-300">
                  Leinensoft<br />
                  Proprietor / Responsible Person: Luke Leinen<br />
                  Email: <a href="mailto:luke@leinensoft.de" className="text-sky-400 underline hover:text-sky-300">luke@leinensoft.de</a><br />
                  Website: <a href="https://leinensoft.de" target="_blank" rel="noopener noreferrer" className="text-sky-400 underline hover:text-sky-300">https://leinensoft.de</a><br />
                  Germany / European Union
                </p>
              </div>

              <div>
                <h3 className="font-semibold text-white mb-1">Responsible for Content pursuant to § 18 Sec. 2 MStV:</h3>
                <p className="text-xs text-slate-300">
                  Luke Leinen (Address as indicated above)
                </p>
              </div>

              <div>
                <h3 className="font-semibold text-white mb-1">EU Online Dispute Resolution / Consumer Arbitration:</h3>
                <p className="text-xs text-slate-300">
                  The European Commission provides a platform for online dispute resolution (ODR): <a href="https://ec.europa.eu/consumers/odr/" target="_blank" rel="noopener noreferrer" className="text-sky-400 underline">https://ec.europa.eu/consumers/odr/</a>.<br />
                  Our email address can be found above under service provider info. We are neither willing nor obliged to participate in dispute resolution proceedings before a consumer arbitration board.
                </p>
              </div>
            </div>
          )}

          {type === 'privacy' && (
            <div className="space-y-4">
              <div className="p-3 rounded-lg bg-emerald-950/30 border border-emerald-800/40 text-xs text-emerald-200">
                Data Protection & Privacy Notice pursuant to the General Data Protection Regulation (EU GDPR / DSGVO - Articles 13 & 14):
              </div>

              <div>
                <h3 className="font-semibold text-white mb-1">1. Data Controller</h3>
                <p className="text-xs text-slate-300">
                  The data controller within the meaning of the GDPR is Luke Leinen (Leinensoft), Contact: <a href="mailto:luke@leinensoft.de" className="text-emerald-400 underline">luke@leinensoft.de</a>.
                </p>
              </div>

              <div>
                <h3 className="font-semibold text-white mb-1">2. Collection and Processing of Connection Data</h3>
                <p className="text-xs text-slate-300">
                  When accessing this orchestrator dashboard, standard server connection logs (such as IP address, access timestamp, transferred data volume, and user agent) are processed transiently to guarantee stable system operations and ensure network security (Legal basis: Art. 6(1)(f) GDPR).
                </p>
              </div>

              <div>
                <h3 className="font-semibold text-white mb-1">3. Orchestration & Execution Audit Logs</h3>
                <p className="text-xs text-slate-300">
                  Audit logs and transaction histories displayed within the console log exclusively technical host state, remote script execution exit codes, and profile transition records for infrastructure maintenance purposes. No advertising trackers, third-party analytics cookies, or behavioral profiling are employed.
                </p>
              </div>

              <div>
                <h3 className="font-semibold text-white mb-1">4. Your Rights under GDPR</h3>
                <p className="text-xs text-slate-300">
                  You are entitled under the GDPR to request access to your personal data (Art. 15), rectification (Art. 16), erasure (Art. 17), restriction of processing (Art. 18), data portability (Art. 20), and to object to processing (Art. 21). You also have the right to lodge a complaint with a competent data protection supervisory authority (Art. 77 GDPR).
                </p>
              </div>
            </div>
          )}

          {type === 'disclaimer' && (
            <div className="space-y-4">
              <div className="p-3 rounded-lg bg-amber-950/30 border border-amber-800/40 text-xs text-amber-200">
                Limitation of Liability pursuant to §§ 7–10 of the German Telemedia Act (TMG):
              </div>

              <div>
                <h3 className="font-semibold text-white mb-1">Liability for Content</h3>
                <p className="text-xs text-slate-300">
                  As a service provider, we are responsible for our own content on these pages under general law pursuant to § 7 Sec. 1 TMG. However, under §§ 8 to 10 TMG, we are not obligated to monitor transmitted or stored third-party information or to investigate circumstances that indicate unlawful activity. Obligations to remove or block the use of information in accordance with general legislation remain unaffected.
                </p>
              </div>

              <div>
                <h3 className="font-semibold text-white mb-1">Liability for External Links</h3>
                <p className="text-xs text-slate-300">
                  Our application may contain links to external third-party websites over whose contents we have no influence. Therefore, we cannot assume any liability for these external contents. The respective provider or operator of the pages is always responsible for the contents of linked websites.
                </p>
              </div>

              <div>
                <h3 className="font-semibold text-white mb-1">Automation & Fail-Safe Invariants</h3>
                <p className="text-xs text-slate-300">
                  The Switchr application executes remote automation scripts and configuration profiles on target machines. All profile definitions and scripts must be thoroughly verified before deployment in production environments. Developers and operators assume no liability for service downtime, data loss, or misconfigurations resulting from executed custom scripts.
                </p>
              </div>
            </div>
          )}

          {type === 'trademarks' && (
            <div className="space-y-4">
              <div className="p-3 rounded-lg bg-purple-950/30 border border-purple-800/40 text-xs text-purple-200">
                Copyright and Third-Party Trademarks Notice:
              </div>

              <div>
                <h3 className="font-semibold text-white mb-1">Copyright Protection</h3>
                <p className="text-xs text-slate-300">
                  The content, software code, and works created by the site operators on these pages are subject to German and European copyright laws. Reproduction, adaptation, distribution, or any form of commercialization outside the limits of copyright law requires prior written consent from the author or creator.
                </p>
              </div>

              <div>
                <h3 className="font-semibold text-white mb-1">Third-Party Trademarks</h3>
                <p className="text-xs text-slate-300">
                  All brand names and trademarks mentioned within this application (including Windows, WinRM, Microsoft Corporation, Linux, SSH, OpenSSH, Docker, systemd, PowerShell) are subject without restriction to the provisions of the respective trademark law and the ownership rights of their registered holders.
                </p>
                <p className="text-xs text-slate-400 mt-2">
                  The mere mentioning of trademarks does not imply that they are not protected by third-party rights.
                </p>
              </div>
            </div>
          )}
        </div>

        {/* Footer actions */}
        <div className="px-6 py-3 border-t border-slate-800 bg-slate-950/80 flex items-center justify-between">
          <div className="flex items-center gap-1.5 text-xs text-slate-400">
            <ShieldCheck className="w-3.5 h-3.5 text-emerald-400" />
            <span>EU & German Compliance Standards Verified</span>
          </div>
          <button
            onClick={onClose}
            className="px-4 py-1.5 text-xs font-medium rounded-md bg-slate-800 hover:bg-slate-700 text-white transition-colors"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
};
