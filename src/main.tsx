import { Suspense, useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App.tsx';
import './index.css';
import { ErrorBoundary, lazyWithReload } from './utils/lazyRetry';

// The management dashboard is a separate lazily-loaded bundle reachable at #admin.
const AdminApp = lazyWithReload(() => import('./admin/AdminApp.tsx'));
const isAdminRoute = () => window.location.hash.replace(/^#\/?/, '').startsWith('admin');

function Root() {
  const [admin, setAdmin] = useState(isAdminRoute);
  useEffect(() => {
    const sync = () => setAdmin(isAdminRoute());
    window.addEventListener('hashchange', sync);
    return () => window.removeEventListener('hashchange', sync);
  }, []);
  if (admin) {
    return (
      <Suspense fallback={<div className="min-h-screen flex items-center justify-center text-stone-500">…</div>}>
        <AdminApp />
      </Suspense>
    );
  }
  return <App />;
}

// Tier 1 Google Maps Platform quota / auth defense (Case A Demo Project):
// surfaces a clean Arabic/English quota banner in App when demo limits or auth issues trigger.
if (typeof window !== 'undefined') {
  const dispatchQuotaNotice = () => {
    window.dispatchEvent(new CustomEvent('gmp-quota-exceeded'));
  };
  (window as unknown as { gm_authFailure?: () => void }).gm_authFailure = dispatchQuotaNotice;
  const origConsoleError = console.error.bind(console);
  console.error = (...args: unknown[]) => {
    const joined = args.map((a) => (typeof a === 'string' ? a : '')).join(' ');
    if (/OverQuotaMapError|QuotaExceeded|ApiProjectMapError|RESOURCE_EXHAUSTED/i.test(joined)) {
      dispatchQuotaNotice();
    }
    origConsoleError(...args);
  };
}

// Never a blank page: a crash anywhere shows a message with a reload button instead.
createRoot(document.getElementById('root')!).render(<ErrorBoundary area="site"><Root /></ErrorBoundary>);
