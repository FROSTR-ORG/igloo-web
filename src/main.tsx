import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App.tsx';
import './index.css';
import './lib/nostr-shim';

// Swallow benign relay-close unhandled rejections emitted by nostr-p2p during transient echo nodes.
if (typeof window !== 'undefined') {
  const swallowRelayClose = (reason: unknown) => {
    const msg = String((reason as any)?.message ?? reason ?? '').toLowerCase();
    if (msg.includes('relay connection closed by us')) {
      console.debug('[igloo] swallowed benign relay close');
      return true;
    }
    return false;
  };

  window.addEventListener('unhandledrejection', (event) => {
    if (swallowRelayClose(event.reason)) {
      event.preventDefault();
    }
  });
}

ReactDOM.createRoot(document.getElementById('root') as HTMLElement).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
