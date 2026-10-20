import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { HttpAdminApi } from './admin-api.js';
import { AdminApp } from './app.js';
import '@posha/ui/styles.css';

const root = document.getElementById('root');
if (!root) throw new Error('Admin root element is missing.');

createRoot(root).render(
  <StrictMode>
    <div className="ember-theme" data-theme="light">
      <AdminApp api={new HttpAdminApi()} />
    </div>
  </StrictMode>,
);
