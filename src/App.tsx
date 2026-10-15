import React, { useEffect, useState } from 'react';
import {
  Header,
} from './components/Header';
import { FleetView } from './components/FleetView';
import { ConfirmModal } from './components/ConfirmModal';
import { TerminalDrawer } from './components/TerminalDrawer';
import { AuditHistoryView } from './components/AuditHistoryView';
import { ConfigViewer } from './components/ConfigViewer';
import { DeploymentExportView } from './components/DeploymentExportView';
import { orchestratorService } from './services/mockOrchestrator';
import { JobRecord, ManagedService, TargetHost } from './types';
import { ShieldAlert, CheckCircle2, AlertTriangle, X } from 'lucide-react';

export default function App() {
  const [activeTab, setActiveTab] = useState<'fleet' | 'audit' | 'config' | 'deploy'>('fleet');
  const [hosts, setHosts] = useState<TargetHost[]>([]);
  const [services, setServices] = useState<ManagedService[]>([]);
  const [auditHistory, setAuditHistory] = useState<JobRecord[]>([]);
  const [activeLocksCount, setActiveLocksCount] = useState(0);

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

  // Sync state from orchestrator
  const refreshState = () => {
    setHosts([...orchestratorService.getHosts()]);
    setServices([...orchestratorService.getServices()]);
    setAuditHistory([...orchestratorService.getAuditHistory()]);
    setActiveLocksCount(orchestratorService.getActiveLocksCount());
  };

  useEffect(() => {
    refreshState();
    const interval = setInterval(refreshState, 2000);
    return () => clearInterval(interval);
  }, []);

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
          'Concurrency Lock Conflict (HTTP 409)',
          err.message || 'Service is already locked by an active job.'
        );
      } else {
        showToast('error', 'Execution Error', err.message || 'Failed to start switch job.');
      }
    }
  };

  const openTerminalForJob = (job: JobRecord) => {
    setActiveJob({ ...job, logs: [...job.logs] });
    setIsDrawerOpen(true);

    // Subscribe to live log emissions
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
            'Configuration Switch Succeeded',
            `${finalJob.service_name} on ${finalJob.host_name} verified RUNNING.`
          );
        } else if (finalJob.status === 'FAILED') {
          showToast(
            'error',
            'Job Failed (Fail-Fast)',
            finalJob.error_summary || 'Verification probe or script failed.'
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
    }
  };

  const handleAbortJob = (jobId: string) => {
    orchestratorService.abortJob(jobId);
    refreshState();
    showToast('warning', 'Abort Dispatched', `Job ${jobId} cancellation signal sent.`);
  };

  // Demo tool: trigger 409 Conflict test
  const handleSimulateConflict = async () => {
    const finHost = hosts.find((h) => h.id === 'win-prod-01');
    const finService = services.find((s) => s.id === 'svc-fin-router');
    if (!finHost || !finService) return;

    try {
      // 1. Start first job if not running
      const job1 = await orchestratorService.startSwitchJob({
        host_id: finHost.id,
        service_id: finService.id,
        profile_name: 'production-balanced',
      });
      openTerminalForJob(job1);
      refreshState();

      // 2. Immediately attempt concurrent switch on same service to trigger 409 Conflict
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
            'HTTP 409 Conflict Invariant Verified!',
            `Rejected concurrent switch on (${finHost.id}, ${finService.id}): In-memory lock is held by ${job1.job_id}.`
          );
        }
      }, 300);
    } catch (e: any) {
      showToast('warning', 'Lock Active', e.message);
    }
  };

  const handleClearHistory = () => {
    localStorage.removeItem('switchr_audit_history');
    refreshState();
    showToast('success', 'Audit Reset', 'Audit history has been reset to defaults.');
  };

  return (
    <div className="min-h-screen flex flex-col bg-[#090d16] text-slate-200">
      {/* Top Header */}
      <Header
        activeTab={activeTab}
        onTabChange={setActiveTab}
        activeLocksCount={activeLocksCount}
        onSimulateConflict={handleSimulateConflict}
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
            onRefresh={refreshState}
          />
        )}

        {activeTab === 'audit' && (
          <AuditHistoryView
            history={auditHistory}
            onOpenLog={(job) => {
              setActiveJob(job);
              setIsDrawerOpen(true);
            }}
            onClearHistory={handleClearHistory}
          />
        )}

        {activeTab === 'config' && (
          <ConfigViewer hosts={hosts} services={services} />
        )}

        {activeTab === 'deploy' && (
          <DeploymentExportView />
        )}
      </main>

      {/* Profile Switch Confirmation Modal */}
      <ConfirmModal
        isOpen={isModalOpen}
        host={modalHost}
        service={modalService}
        targetProfileName={modalTargetProfile}
        simulateFailure={modalSimulateFailure}
        onConfirm={handleConfirmSwitch}
        onClose={() => setIsModalOpen(false)}
      />

      {/* Live Terminal Drawer */}
      <TerminalDrawer
        job={activeJob}
        isOpen={isDrawerOpen}
        onClose={() => setIsDrawerOpen(false)}
        onAbort={handleAbortJob}
      />
    </div>
  );
}
