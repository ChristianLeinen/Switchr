import React from 'react';
import { createRoot } from 'react-dom/client';
import App from './App.tsx';
import './i18n';
import './index.css';

createRoot(document.getElementById('root')!).render(
  <React.Suspense
    fallback={
      <div className="min-h-screen flex items-center justify-center bg-slate-50 dark:bg-[#090d16] text-slate-600 dark:text-slate-300 text-sm font-mono">
        Loading...
      </div>
    }
  >
    <App />
  </React.Suspense>
);
