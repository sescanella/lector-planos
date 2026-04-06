import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { AuthProvider } from '@/context/AuthContext';
import { AuthGuard } from '@/components/layout/AuthGuard';
import { AppShell } from '@/components/kronos/AppShell';
import { RootErrorBoundary } from '@/components/ErrorBoundary';
import { LoginPage } from '@/pages/LoginPage';
import OTsPage from '@/pages/OTsPage';
import { NuevaOTPage } from '@/pages/NuevaOTPage';
import OTDetailPage from '@/pages/OTDetailPage';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 1,
      refetchOnWindowFocus: true,
    },
  },
});

export default function App() {
  return (
    <RootErrorBoundary>
      <QueryClientProvider client={queryClient}>
        <AuthProvider>
          <BrowserRouter>
            <Routes>
              <Route path="/login" element={<LoginPage />} />
              <Route
                path="/ots"
                element={
                  <AuthGuard>
                    <AppShell>
                      <OTsPage />
                    </AppShell>
                  </AuthGuard>
                }
              />
              <Route
                path="/ots/nueva"
                element={
                  <AuthGuard>
                    <AppShell>
                      <NuevaOTPage />
                    </AppShell>
                  </AuthGuard>
                }
              />
              <Route
                path="/ots/:otId"
                element={
                  <AuthGuard>
                    <AppShell>
                      <OTDetailPage />
                    </AppShell>
                  </AuthGuard>
                }
              />
              {/* Redirects from old routes */}
              <Route path="/jobs" element={<Navigate to="/ots" replace />} />
              <Route path="/jobs/:jobId" element={<Navigate to="/ots" replace />} />
              <Route path="/" element={<Navigate to="/ots" replace />} />
              <Route
                path="*"
                element={
                  <div className="min-h-screen bg-primary-dark flex items-center justify-center">
                    <div className="text-center">
                      <p className="font-heading text-[11px] font-semibold tracking-[0.3em] uppercase text-white/40 mb-4">
                        PÁGINA NO ENCONTRADA
                      </p>
                      <a
                        href="/ots"
                        className="font-heading text-[11px] font-semibold tracking-[0.15em] uppercase text-accent hover:underline"
                      >
                        VOLVER A OTS
                      </a>
                    </div>
                  </div>
                }
              />
            </Routes>
          </BrowserRouter>
        </AuthProvider>
      </QueryClientProvider>
    </RootErrorBoundary>
  );
}
