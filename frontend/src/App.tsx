import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { AuthProvider } from '@/context/AuthContext';
import { AuthGuard } from '@/components/layout/AuthGuard';
import { Header } from '@/components/layout/Header';
import { Breadcrumbs } from '@/components/layout/Breadcrumbs';
import { RootErrorBoundary } from '@/components/ErrorBoundary';
import { Toaster } from '@/components/ui/toaster';
import { LoginPage } from '@/pages/LoginPage';
import { JobsPage } from '@/pages/JobsPage';
import { JobDetailPage } from '@/pages/JobDetailPage';
import { SpoolDetailPage } from '@/pages/SpoolDetailPage';

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
            <div className="min-h-screen bg-background">
              <Header />
              <Breadcrumbs />
              <main>
                <Routes>
                  <Route path="/login" element={<LoginPage />} />
                  <Route path="/jobs" element={<AuthGuard><JobsPage /></AuthGuard>} />
                  <Route path="/jobs/:jobId" element={<AuthGuard><JobDetailPage /></AuthGuard>} />
                  <Route path="/jobs/:jobId/spools/:spoolId" element={<AuthGuard><SpoolDetailPage /></AuthGuard>} />
                  <Route path="/" element={<Navigate to="/jobs" replace />} />
                  <Route path="*" element={
                    <div className="mx-auto max-w-7xl px-4 py-16 text-center">
                      <h2 className="font-heading text-xl font-bold mb-2">Página no encontrada</h2>
                      <p className="text-muted-foreground">La página que buscas no existe.</p>
                    </div>
                  } />
                </Routes>
              </main>
            </div>
            <Toaster />
          </BrowserRouter>
        </AuthProvider>
      </QueryClientProvider>
    </RootErrorBoundary>
  );
}
