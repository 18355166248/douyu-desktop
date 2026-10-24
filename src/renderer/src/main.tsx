import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { App } from './App';
import { DanmakuSettingsProvider } from './features/danmaku/DanmakuSettingsContext';
import { TasksProvider } from './features/tasks/useTasks';
import './styles/index.css';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 1,
      refetchOnWindowFocus: false,
    },
    mutations: {
      retry: 0,
    },
  },
});

const rootElement = document.getElementById('root');
if (!rootElement) throw new Error('Root element not found');

createRoot(rootElement).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <TasksProvider>
        <DanmakuSettingsProvider>
          <App />
        </DanmakuSettingsProvider>
      </TasksProvider>
    </QueryClientProvider>
  </StrictMode>,
);
