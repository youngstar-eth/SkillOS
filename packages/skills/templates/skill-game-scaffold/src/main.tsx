import React from 'react';
import ReactDOM from 'react-dom/client';
import { Providers } from './SkillOSProvider';
import { App } from './App';

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <Providers>
      <App />
    </Providers>
  </React.StrictMode>,
);
