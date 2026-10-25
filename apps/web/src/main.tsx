import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import '@posha/ui/styles.css';
import './styles.css';

// Suppress known Chrome extension bfcache console.error
const originalConsoleError = console.error;
console.error = (...args: unknown[]) => {
  const msg = args[0] as string;
  // Suppress known extension bfcache error
  if (msg.includes('The page keeping the extension port is moved into back/forward cache')) {
    return; // silently swallow
  }
  return originalConsoleError.apply(console, args);
};

import { App } from './app.js';

const root = document.getElementById('root');
if (!root) throw new Error('POSHA app root element is missing');

createRoot(root).render(
  <StrictMode>
    <App />
  </StrictMode>
);

if (import.meta.env.PROD && 'serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    void navigator.serviceWorker.register('/sw.js');
  });
}
