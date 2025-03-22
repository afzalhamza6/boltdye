import { RemixBrowser } from '@remix-run/react';
import { startTransition } from 'react';
import { hydrateRoot } from 'react-dom/client';
import { setupLogViewer } from './utils/log-viewer';

// Initialize log viewer in development mode
if (import.meta.env.DEV && import.meta.env.VITE_LOG_LEVEL === 'debug') {
  setupLogViewer();
}

startTransition(() => {
  hydrateRoot(document.getElementById('root')!, <RemixBrowser />);
});
