import React, { Suspense, useCallback, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Header,
} from './components/Header';
import { FleetView } from './components/FleetView';
import { ConfirmModal } from './components/ConfirmModal';
import { TerminalDrawer } from './components/TerminalDrawer';
import { AuditHistoryView } from './components/AuditHistoryView';
import { Footer } from './components/Footer';
import { LegalModal, LegalModalType } from './components/LegalModal';
import { useTheme } from './hooks/useTheme';
import { orchestratorService } from './services/mockOrchestrator';
import { JobRecord, ManagedService, TargetHost } from './types';
import { ShieldAlert, CheckCircle2, AlertTriangle, X } from 'lucide-react';

const REFRESH_INTERVAL_STORAGE_KEY = 'switchr_refresh_interval_ms';
const ALLOWED_REFRESH_INTERVALS = [0, 5000, 15000, 30000, 60000] as const;

function loadStoredRefreshInterval(): number {
  try {
    const raw = localStorage.getItem(REFRESH_INTERVAL_STORAGE_KEY);
    if (raw !== null) {
      const parsed = Number(raw);
      if (ALLOWED_REFRESH_INTERVALS.includes(parsed as any)) {
        return parsed;
      }
    }
  } catch {
    // ignore storage errors
  }
  return 0; // Default: Off
}

export default function App() {
  const { t } = useTranslation('App');
  const { theme, toggleTheme } = useTheme();
  const [activeTab, setActiveTab] = useState<'fleet' | 'audit'>('fleet');
  const [hosts, setHosts] = useState<TargetHost[]>([]);
  const [services, setServices] = useState<ManagedService[]>([]);
  const [auditHistory, setAuditHistory] = useState<JobRecord[]>([]);
  const [activeLocksCount, setActiveLocksCount] = useState(0);
  const [dryRun, setDryRun] = useState(false);
  const [refreshIntervalMs, setRefreshIntervalMs] = useState<number>(loadStoredRefreshInterval);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [activeLegalModal, setActiveLegalModal] = useState<LegalModalType>(null);

  const activeTabRef = useRef(activeTab);
  activeTabRef.current = activeTab;
  const inFlightRefreshRef = useRef<{ promise: Promise<void>; includeHistory: boolean } | null>(null);

  // Active Job Drawer State
  const [activeJob, setActiveJob] = useState<JobRecord | null>(null);
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);

  // Switch Confirmation Modal State
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [modalHost, setModalHost] = useState<TargetHost | null>(null);
  const [modalService, setModalService] = useState<ManagedService | null>(null);
  const [modalTargetProfile, setModalTargetProfile] = useState('');
  const [modalSimulateFailure, setModalSimulateFailure] = useState(false);

  // Conflict / Toast Notice State
  const [toastMessage, setToastMessage] = useState<{
    type: 'success' | 'error' | 'warning';
    title: string;
    description: string;
  } | null>(null);

  // Sync state from API with fallback to orchestratorService (prevents overlapping refreshes)
  const refreshState = useCallback(async (options?: { includeHistory?: boolean; minSpinMs?: number }) => {
    const includeHistory = options?.includeHistory ?? true;
    const minSpinMs = options?.minSpinMs ?? 0;

    if (inFlightRefreshRef.current) {
      const existing = inFlightRefreshRef.current;
      await existing.promise;
      if (!includeHistory || existing.includeHistory) {
        return;
      }
    }

    const startTime = performance.now();
    setIsRefreshing(true);

    const run = async () => {
      try {
        const res = await fetch('/api/inventory', { cache: 'no-store' });
        if (res.ok) {
          const data = await res.json();
          const allServices: ManagedService[] = [];
          data.hosts.forEach((h: any) => {
            if (h.services) allServices.push(...h.services);
          });
          setHosts(data.hosts);
          setServices(allServices);
          setActiveLocksCount(data.active_locks_count ?? 0);
          setDryRun(Boolean(data.dry_run));

          if (includeHistory) {
            const hRes = await fetch('/api/jobs/history', { cache: 'no-store' });
            if (hRes.ok) {
              const hData = await hRes.json();
              if (hData.history) setAuditHistory(hData.history);
            }
          }
          return;
        }
      } catch {
        // Fallback to local orchestratorService
      }

      setHosts([...orchestratorService.getHosts()]);
      setServices([...orchestratorService.getServices()]);
      if (includeHistory) {
        setAuditHistory([...orchestratorService.getAuditHistory()]);
      }
      setActiveLocksCount(orchestratorService.getActiveLocksCount());
      setDryRun(true);
    };

    const promise = run().finally(async () => {
      const elapsed = performance.now() - startTime;
      if (minSpinMs > elapsed) {
        await new Promise((resolve) => setTimeout(resolve, minSpinMs - elapsed));
      }
      inFlightRefreshRef.current = null;
      setIsRefreshing(false);
    });

    inFlightRefreshRef.current = { promise, includeHistory };
    await promise;
  }, []);

  const handleChangeRefreshInterval = (intervalMs: number) => {
    setRefreshIntervalMs(intervalMs);
    try {
      localStorage.setItem(REFRESH_INTERVAL_STORAGE_KEY, String(intervalMs));
    } catch {
      // ignore storage errors
    }
  };

  const handleManualRefresh = () => {
    void refreshState({ includeHistory: true, minSpinMs: 350 });
  };

  // Initial load on mount
  useEffect(() => {
    void refreshState({ includeHistory: true });
  }, [refreshState]);

  // Refresh audit history when switching to the Audit History tab
  useEffect(() => {
    if (activeTab === 'audit') {
      void refreshState({ includeHistory: true });
    }
  }, [activeTab, refreshState]);

  // Sequential, visibility-aware auto-refresh when enabled (refreshIntervalMs > 0)
  useEffect(() => {
    if (refreshIntervalMs <= 0) return;

    let cancelled = false;
    let timerId: ReturnType<typeof setTimeout> | null = null;

    const clearTimer = () => {
      if (timerId !== null) {
        clearTimeout(timerId);
        timerId = null;
      }
    };

    const scheduleNext = () => {
      clearTimer();
      if (cancelled || document.hidden) return;
      timerId = setTimeout(async () => {
        if (cancelled || document.hidden) return;
        await refreshState({ includeHistory: activeTabRef.current === 'audit' });
        scheduleNext();
      }, refreshIntervalMs);
    };

    const handleVisibilityChange = () => {
      if (document.hidden) {
        clearTimer();
      } else if (!cancelled) {
        void refreshState({ includeHistory: activeTabRef.current === 'audit' }).then(() => {
          scheduleNext();
        });
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    scheduleNext();

    return () => {
      cancelled = true;
      clearTimer();
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [refreshIntervalMs, refreshState]);

  const showToast = (type: 'success' | 'error' | 'warning', title: string, description: string) => {
    setToastMessage({ type, title, description });
    setTimeout(() => setToastMessage(null), 6000);
  };

  // Switch initiation from FleetView
  const handleInitiateSwitch = (
    host: TargetHost,
    service: ManagedService,
    targetProfile: string,
    simulateFailure: boolean
  ) => {
    setModalHost(host);
    setModalService(service);
    setModalTargetProfile(targetProfile);
    setModalSimulateFailure(simulateFailure);
    setIsModalOpen(true);
  };

  // Execution confirmed in modal
  const handleConfirmSwitch = async () => {
    if (!modalHost || !modalService || !modalTargetProfile) return;
    setIsModalOpen(false);

    try {
      // Attempt backend API call
      const res = await fetch('/api/jobs/switch', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          host_id: modalHost.id,
          service_id: modalService.id,
          profile_name: modalTargetProfile,
          simulate_failure: modalSimulateFailure,
        }),
      });

      if (res.status === 409) {
        const err = await res.json();
        showToast(
          'warning',
          t('toasts.conflictTitle'),
          err.detail || t('toasts.conflictDefaultDetail')
        );
        refreshState();
        return;
      }

      if (res.ok) {
        const data = await res.json();
        const newJob: JobRecord = {
          job_id: data.job_id,
          host_id: modalHost.id,
          host_name: modalHost.name,
          os_type: modalHost.os_type,
          service_id: modalService.id,
          service_name: modalService.name,
          target_profile: modalTargetProfile,
          previous_profile: modalService.current_profile,
          status: 'RUNNING',
          started_at: new Date().toISOString(),
          verification_passed: false,
          is_simulation: true,
          logs: [],
        };
        refreshState();
        openSseTerminal(newJob);
        return;
      }
    } catch {
      // Fallback to local orchestratorService
    }

    try {
      const job = await orchestratorService.startSwitchJob({
        host_id: modalHost.id,
        service_id: modalService.id,
        profile_name: modalTargetProfile,
        simulate_failure: modalSimulateFailure,
      });

      refreshState();
      openTerminalForJob(job);
    } catch (err: any) {
      if (err.status === 409 || err.message?.includes('409')) {
        showToast(
          'warning',
          t('toasts.conflictTitle'),
          err.message || t('toasts.conflictDefaultDetail')
        );
      } else {
        showToast('error', t('toasts.executionErrorTitle'), err.message || t('toasts.executionErrorDefault'));
      }
    }
  };

  const openSseTerminal = (job: JobRecord) => {
    setActiveJob(job);
    setIsDrawerOpen(true);

    const eventSource = new EventSource(`/api/jobs/${job.job_id}/stream`);

    eventSource.onmessage = (event) => {
      const text = event.data;
      if (!text) return;
      const now = new Date();
      const timeStr = `${now.toTimeString().split(' ')[0]}.${String(now.getMilliseconds()).padStart(3, '0')}`;
      
      let type: any = 'stdout';
      if (text.includes('[stderr]') || text.includes('[FATAL]') || text.includes('[error]')) type = 'error';
      else if (text.includes('[✓]')) type = 'success';
      else if (text.includes('[!]')) type = 'warn';
      else if (text.includes('[$]') || text.includes('[*]')) type = 'info';

      setActiveJob((prev) => {
        if (!prev || prev.job_id !== job.job_id) return prev;
        return {
          ...prev,
          logs: [
            ...prev.logs,
            { id: Math.random().toString(36).substring(2, 9), timestamp: timeStr, text, type },
          ],
        };
      });
    };

    eventSource.addEventListener('done', (event: any) => {
      const finalStatus = event.data || 'SUCCESS';
      const isSuccess = finalStatus === 'SUCCESS';
      setActiveJob((prev) =>
        prev
          ? {
              ...prev,
              status: finalStatus as any,
              verification_passed: isSuccess,
              exit_code: isSuccess ? 0 : prev.exit_code ?? 1,
            }
          : null
      );
      eventSource.close();
      refreshState();
      if (isSuccess) {
        showToast('success', t('toasts.switchSucceededTitle'), t('toasts.switchSucceededRunning', { serviceName: job.service_name }));
      } else {
        showToast('error', t('toasts.jobFailedTitle'), t('toasts.jobFailedDefault'));
      }
    });

    eventSource.onerror = () => {
      eventSource.close();
    };
  };

  const openTerminalForJob = (job: JobRecord) => {
    setActiveJob({ ...job, logs: [...job.logs] });
    setIsDrawerOpen(true);

    const unsubscribe = orchestratorService.subscribeJobLogs(
      job.job_id,
      (line) => {
        setActiveJob((prev) => {
          if (!prev || prev.job_id !== job.job_id) return prev;
          return {
            ...prev,
            logs: [...prev.logs, line],
          };
        });
      },
      (finalJob) => {
        setActiveJob({ ...finalJob, logs: [...finalJob.logs] });
        refreshState();
        if (finalJob.status === 'SUCCESS') {
          showToast(
            'success',
            t('toasts.switchSucceededTitle'),
            t('toasts.switchSucceededOnHost', { serviceName: finalJob.service_name, hostName: finalJob.host_name })
          );
        } else if (finalJob.status === 'FAILED') {
          showToast(
            'error',
            t('toasts.jobFailedTitle'),
            finalJob.error_summary || t('toasts.jobFailedProbeOrScript')
          );
        }
      }
    );

    return unsubscribe;
  };

  const handleOpenLiveStream = (jobId: string, label: string) => {
    const job = orchestratorService.getJob(jobId);
    if (job) {
      openTerminalForJob(job);
    } else {
      openSseTerminal({
        job_id: jobId,
        host_id: '',
        host_name: '',
        os_type: 'windows',
        service_id: '',
        service_name: label,
        target_profile: '',
        previous_profile: '',
        status: 'RUNNING',
        started_at: new Date().toISOString(),
        verification_passed: false,
        is_simulation: true,
        logs: [],
      });
    }
  };

  const handleAbortJob = async (jobId: string) => {
    try {
      await fetch(`/api/jobs/${jobId}/abort`, { method: 'POST' });
    } catch {
      // Fallback
    }
    orchestratorService.abortJob(jobId);
    refreshState();
    showToast('warning', t('toasts.abortDispatchedTitle'), t('toasts.abortDispatchedDetail', { jobId }));
  };

  // Demo tool: trigger 409 Conflict test
  const handleSimulateConflict = async () => {
    const finHost = hosts.find((h) => h.id === 'win-prod-01');
    const finService = services.find((s) => s.id === 'svc-fin-router');
    if (!finHost || !finService) return;

    try {
      // 1. Start first job if not running
      const res1 = await fetch('/api/jobs/switch', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          host_id: finHost.id,
          service_id: finService.id,
          profile_name: 'production-balanced',
        }),
      });

      if (res1.ok) {
        await res1.json();
        showToast('warning', t('toasts.job1DispatchedTitle'), t('toasts.job1DispatchedDetail', { hostId: finHost.id, serviceId: finService.id }));
        refreshState();

        // 2. Immediately attempt concurrent switch on same service to trigger 409 Conflict
        setTimeout(async () => {
          const res2 = await fetch('/api/jobs/switch', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              host_id: finHost.id,
              service_id: finService.id,
              profile_name: 'maintenance-drain',
            }),
          });

          if (res2.status === 409) {
            const err = await res2.json();
            showToast(
              'warning',
              t('toasts.conflictVerifiedTitle'),
              err.detail || t('toasts.conflictVerifiedDetail', { hostId: finHost.id, serviceId: finService.id })
            );
          }
        }, 300);
        return;
      }
    } catch {
      // Fallback to local
    }

    try {
      const job1 = await orchestratorService.startSwitchJob({
        host_id: finHost.id,
        service_id: finService.id,
        profile_name: 'production-balanced',
      });
      openTerminalForJob(job1);
      refreshState();

      setTimeout(async () => {
        try {
          await orchestratorService.startSwitchJob({
            host_id: finHost.id,
            service_id: finService.id,
            profile_name: 'maintenance-drain',
          });
        } catch (err: any) {
          showToast(
            'warning',
            t('toasts.conflictVerifiedTitle'),
            t('toasts.conflictVerifiedLockHeld', { hostId: finHost.id, serviceId: finService.id, jobId: job1.job_id })
          );
        }
      }, 300);
    } catch (e: any) {
      showToast('warning', t('toasts.lockActiveTitle'), e.message);
    }
  };

  const handleClearHistory = async () => {
    try {
      await fetch('/api/jobs/history', { method: 'DELETE' });
    } catch {
      // Backend request fallback
    }
    localStorage.removeItem('switchr_audit_history');
    orchestratorService.clearAuditHistory();
    setAuditHistory([]);
    await refreshState();
    showToast('success', t('toasts.auditResetTitle'), t('toasts.auditResetDetail'));
  };

  return (
    <div className="min-h-screen flex flex-col bg-slate-50 dark:bg-[#090d16] text-slate-800 dark:text-slate-200 transition-colors duration-150">
      {/* Top Header */}
      <Header
        activeTab={activeTab}
        onTabChange={setActiveTab}
        activeLocksCount={activeLocksCount}
        dryRun={dryRun}
        onSimulateConflict={handleSimulateConflict}
        theme={theme}
        onToggleTheme={toggleTheme}
      />

      {/* Toast Notification Banner */}
      {toastMessage && (
        <div className="fixed top-20 right-6 z-50 max-w-md w-full animate-in slide-in-from-top-2 duration-200">
          <div
            className={`p-4 rounded-lg border shadow-xl flex items-start gap-3 ${
              toastMessage.type === 'success'
                ? 'bg-emerald-950/90 border-emerald-800 text-emerald-200'
                : toastMessage.type === 'error'
                ? 'bg-rose-950/90 border-rose-800 text-rose-200'
                : 'bg-amber-950/95 border-amber-700 text-amber-200'
            }`}
          >
            {toastMessage.type === 'success' && <CheckCircle2 className="w-5 h-5 text-emerald-400 shrink-0 mt-0.5" />}
            {toastMessage.type === 'error' && <AlertTriangle className="w-5 h-5 text-rose-400 shrink-0 mt-0.5" />}
            {toastMessage.type === 'warning' && <ShieldAlert className="w-5 h-5 text-amber-400 shrink-0 mt-0.5" />}

            <div className="flex-1 min-w-0">
              <div className="text-xs font-bold font-mono uppercase tracking-wider">{toastMessage.title}</div>
              <div className="text-xs mt-0.5 font-sans leading-relaxed">{toastMessage.description}</div>
            </div>

            <button
              onClick={() => setToastMessage(null)}
              aria-label={t('toasts.dismissAriaLabel')}
              className="text-slate-400 hover:text-white p-1 rounded transition-colors"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}

      {/* Main Content Area */}
      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {activeTab === 'fleet' && (
          <FleetView
            hosts={hosts}
            services={services}
            onInitiateSwitch={handleInitiateSwitch}
            onOpenLiveStream={handleOpenLiveStream}
            onRefresh={handleManualRefresh}
            isRefreshing={isRefreshing}
            refreshIntervalMs={refreshIntervalMs}
            onChangeRefreshInterval={handleChangeRefreshInterval}
          />
        )}

        {activeTab === 'audit' && (
          <Suspense fallback={<div className="py-12 text-center text-xs font-mono text-slate-500 dark:text-slate-400">{t('loading')}</div>}>
            <AuditHistoryView
              history={auditHistory}
              onOpenLog={(job) => {
                setActiveJob(job);
                setIsDrawerOpen(true);
              }}
              onClearHistory={handleClearHistory}
            />
          </Suspense>
        )}
      </main>

      {/* Footer with Legal & Copyright information */}
      <Footer onOpenLegal={(type) => setActiveLegalModal(type)} />

      {/* Legal Popups / Modal */}
      <Suspense fallback={null}>
        <LegalModal
          type={activeLegalModal}
          onClose={() => setActiveLegalModal(null)}
        />
      </Suspense>

      {/* Profile Switch Confirmation Modal */}
      <Suspense fallback={null}>
        <ConfirmModal
          isOpen={isModalOpen}
          host={modalHost}
          service={modalService}
          targetProfileName={modalTargetProfile}
          simulateFailure={modalSimulateFailure}
          onConfirm={handleConfirmSwitch}
          onClose={() => setIsModalOpen(false)}
        />
      </Suspense>

      {/* Live Terminal Drawer */}
      <Suspense fallback={null}>
        <TerminalDrawer
          job={activeJob}
          isOpen={isDrawerOpen}
          onClose={() => setIsDrawerOpen(false)}
          onAbort={handleAbortJob}
        />
      </Suspense>
    </div>
  );
}
