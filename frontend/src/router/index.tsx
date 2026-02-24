import { IntroForm } from '@/components/molecules';
import VaultGate from '@/components/templates/VaultGate/VaultGate';
import { Suspense } from 'react';
import { Navigate, Route, Routes } from 'react-router-dom';
import { layoutConfigs } from './config';

function RouteFallback() {
  return (
    <div className="flex items-center justify-center min-h-[40vh]">
      로딩 중...
    </div>
  );
}

const AppLayout = (
  <VaultGate>
    <IntroForm />
  </VaultGate>
);

export function AppRoutes() {
  return (
    <Suspense fallback={<RouteFallback />}>
      <Routes>
        {layoutConfigs.map(({ basePath, routes, defaultRedirect }) => (
          <Route key={basePath} path={basePath} element={AppLayout}>
            <Route
              index
              element={
                <Navigate to={`${basePath}/${defaultRedirect}`} replace />
              }
            />
            {routes.map((r) => (
              <Route
                key={r.name}
                path={r.path}
                element={
                  <Suspense fallback={<RouteFallback />}>
                    <r.component />
                  </Suspense>
                }
              />
            ))}
          </Route>
        ))}

        <Route path="/" element={<Navigate to="/app/vault" replace />} />
        <Route path="*" element={<Navigate to="/app/vault" replace />} />
      </Routes>
    </Suspense>
  );
}
