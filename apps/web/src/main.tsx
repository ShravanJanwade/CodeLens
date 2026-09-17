import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import App from './App';
import AppErrorBoundary from './components/AppErrorBoundary';
// Legacy stylesheets load first so the design system below wins any
// selector they share. Order here is load-bearing.
import './index.css';
import './styles/workspace.css';
import './styles/workflow.css';

import './styles/tokens.css';
import './styles/primitives.css';
import './styles/shell.css';
import './styles/delivery.css';
import './styles/landing.css';
import './styles/surfaces.css';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      retry: 1,
      refetchOnWindowFocus: false,
    },
  },
});

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <AppErrorBoundary>
          <App />
        </AppErrorBoundary>
      </BrowserRouter>
    </QueryClientProvider>
  </StrictMode>,
);
