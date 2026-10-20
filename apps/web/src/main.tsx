import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import '@posha/ui/styles.css';
import './styles.css';
import { App } from './app.js';

const root = document.getElementById('root');
if (!root) throw new Error('POSHA app root element is missing');

createRoot(root).render(
  <StrictMode>
    <div className="ember-theme" data-theme="dark">
      <App />
    </div>
  </StrictMode>,
);

if (import.meta.env.PROD && 'serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    void navigator.serviceWorker.register('/sw.js');
  });
}
