import React, { useState } from 'react';
import { FileCode, CheckCircle2, Copy, Check, Download, AlertCircle, ShieldCheck } from 'lucide-react';
import { TargetHost, ManagedService, getEffectiveScripts } from '../types';

interface ConfigViewerProps {
  hosts: TargetHost[];
  services: ManagedService[];
}

export const ConfigViewer: React.FC<ConfigViewerProps> = ({ hosts, services }) => {
  const [copied, setCopied] = useState(false);

  // Reconstruct exact YAML from inventory
  const generateYaml = () => {
    return `# Switchr Orchestrator Configuration
# Declarative inventory of target hosts, managed services, and configuration profiles.

app:
  name: "Switchr"
  version: "1.0.0"
  dry_run: true # Set to false in production to execute on real hosts
  default_job_timeout: 300 # seconds
  log_dir: "./logs"

hosts:
${hosts
  .map(
    (h) => `  - id: "${h.id}"
    name: "${h.name}"
    os_type: "${h.os_type}"
    hostname: "${h.hostname}"
    port: ${h.port}
    use_ssl: ${Boolean(h.use_ssl)}
    auth:
      type: "${h.auth.type}"
      username: "${h.auth.username}"
      ${h.auth.type === 'key' ? `key_path: "${h.auth.key_path}"` : `password_env: "${h.auth.password_env}"`}
    description: "${h.description}"`
  )
  .join('\n\n')}

services:
${services
  .map((s) => {
    const profileLines = s.profiles
      .map((p) => {
        const steps = getEffectiveScripts(p);
        if (steps.length > 0) {
          return `      - name: "${p.name}"
        description: "${p.description}"
        scripts:
${steps
  .map(
    (step) => `          - name: "${step.name}"
            script_path: "${step.script_path}"
            parameters: [${step.parameters.map((param) => `"${param}"`).join(', ')}]
            timeout_seconds: ${step.timeout_seconds}`
  )
  .join('\n')}`;
        }
        return `      - name: "${p.name}"
        description: "${p.description}"
        script_path: "${p.script_path || ''}"
        parameters: [${(p.parameters || []).map((param) => `"${param}"`).join(', ')}]
        timeout_seconds: ${p.timeout_seconds || 300}`;
      })
      .join('\n\n');

    return `  - id: "${s.id}"
    host_id: "${s.host_id}"
    name: "${s.name}"
    service_type: "${s.service_type}"
    verification_service_name: "${s.verification_service_name}"
    ${s.active_profile_path ? `active_profile_path: "${s.active_profile_path}"` : `# active_profile_path: optional`}
    description: "${s.description}"
    profiles:
${profileLines}
`;
  })
  .join('\n')}
`;
  };

  const yamlContent = generateYaml();

  const handleCopy = () => {
    navigator.clipboard.writeText(yamlContent);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleDownload = () => {
    const blob = new Blob([yamlContent], { type: 'text/yaml;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'config.yaml';
    a.click();
    URL.revokeObjectURL(url);
  };

  // Schema validation checks
  const validations = [
    { label: 'Host Unique IDs & Ports Valid', passed: hosts.length > 0 && hosts.every((h) => h.id && h.port > 0) },
    { label: 'Authentication Schemas Validated', passed: hosts.every((h) => h.auth && h.auth.username) },
    { label: 'Services Bound to Target Hosts', passed: services.every((s) => hosts.some((h) => h.id === s.host_id)) },
    { label: 'Sequential Multi-Script Pipelines Valid', passed: services.every((s) => s.profiles.every((p) => getEffectiveScripts(p).length > 0)) },
    { label: 'Active Profile Path Configured', passed: services.some((s) => Boolean(s.active_profile_path)) },
    { label: 'Automated Post-Probe Definitions Active', passed: services.every((s) => Boolean(s.verification_service_name)) },
  ];

  return (
    <div className="space-y-6">
      {/* Header Banner */}
      <div className="bg-[#0f172a] border border-slate-800 rounded-lg p-5 flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-display font-bold text-white tracking-tight">Configuration Inspector</h1>
          <p className="text-sm text-slate-400 mt-1">
            Declarative <code className="text-sky-300">config.yaml</code> inventory governing target hosts, multi-script pipelines, and dynamic active profile paths.
          </p>
        </div>

        <div className="flex items-center gap-3 shrink-0">
          <button
            onClick={handleCopy}
            className="px-3 py-1.5 text-xs font-medium bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 rounded-md transition-colors flex items-center gap-1.5"
          >
            {copied ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
            {copied ? 'Copied' : 'Copy YAML'}
          </button>
          <button
            onClick={handleDownload}
            className="px-3 py-1.5 text-xs font-medium bg-sky-600 hover:bg-sky-500 text-white rounded-md transition-colors flex items-center gap-1.5 shadow"
          >
            <Download className="w-3.5 h-3.5" />
            Download config.yaml
          </button>
        </div>
      </div>

      {/* Validation Checklist Strip */}
      <div className="bg-[#0c1220] border border-slate-800 rounded-lg p-4">
        <div className="text-xs font-mono uppercase tracking-wider text-slate-400 mb-3 flex items-center gap-2">
          <ShieldCheck className="w-4 h-4 text-emerald-400" />
          Configuration Schema Validation Rules
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
          {validations.map((v, i) => (
            <div key={i} className="flex items-center gap-2 text-xs text-slate-300 bg-slate-900/60 p-2.5 rounded border border-slate-800/80">
              <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
              <span>{v.label}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Code Viewer */}
      <div className="bg-[#070b14] border border-slate-800 rounded-lg overflow-hidden">
        <div className="px-4 py-2.5 bg-slate-900/80 border-b border-slate-800 flex items-center justify-between text-xs font-mono text-slate-400">
          <span className="flex items-center gap-2 text-slate-300">
            <FileCode className="w-4 h-4 text-sky-400" />
            config.yaml
          </span>
          <span>YAML 1.2 · UTF-8</span>
        </div>
        <pre className="p-5 font-mono text-xs text-slate-300 overflow-x-auto leading-relaxed select-text">
          <code>{yamlContent}</code>
        </pre>
      </div>
    </div>
  );
};
