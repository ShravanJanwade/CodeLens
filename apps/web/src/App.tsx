import { Suspense, lazy } from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import { AppLayout } from './layouts/AppLayout';
import ProductLayout from './layouts/ProductLayout';
import Landing from './pages/Landing';
import Login from './features/auth/Login';
import { RequireAuth } from './features/auth/Auth';
import { Loading } from './components/ui';
import { DEMO_REPO } from './features/delivery/types';

// ============================================================
// Route-level code splitting
// ============================================================
// Landing and Login stay in the entry chunk: one of them is the first
// paint for every visitor. Everything else is lazy, which keeps the
// initial download to the marketing page plus the shell instead of
// shipping the charting library to someone who only reads the hero.

const DeliveryPage = lazy(() => import('./features/delivery/DeliveryPage'));
const RunPage = lazy(() => import('./features/delivery/RunPage'));
const ImpactPage = lazy(() => import('./features/delivery/ImpactPage'));
const FlakesPage = lazy(() => import('./features/delivery/FlakesPage'));
const BenchmarkPage = lazy(() => import('./features/delivery/BenchmarkPage'));
const Documentation = lazy(() => import('./pages/Documentation'));
const ReleaseDetail = lazy(() => import('./features/releases/ReleaseDetail'));

const Repositories = lazy(() => import('./pages/Repositories'));
const RepositoryWorkspace = lazy(() => import('./features/repositories/RepositoryWorkspace'));
const RepositoryTools = lazy(() => import('./features/repositories/RepositoryTools'));
const Delivery = lazy(() => import('./features/repositories/Delivery'));
const ChangePublisher = lazy(() => import('./features/repositories/ChangePublisher'));
const Account = lazy(() => import('./features/auth/Account'));
const Settings = lazy(() => import('./pages/Settings'));
const Incidents = lazy(() => import('./pages/Incidents'));
const IncidentDetail = lazy(() => import('./pages/IncidentDetail'));
const Services = lazy(() => import('./pages/Services'));
const ServiceDetail = lazy(() => import('./pages/ServiceDetail'));
const Agents = lazy(() => import('./pages/Agents'));
const Evaluations = lazy(() => import('./pages/Evaluations'));
const Demo = lazy(() => import('./pages/Demo'));
const Investigations = lazy(() => import('./features/releases/Investigations'));

// Investigations exports three components from one module; wrap the
// named ones so they can share a single lazy chunk.
const InvestigationHome = lazy(() =>
  import('./features/releases/Investigations').then((m) => ({ default: m.InvestigationHome })),
);
const ChooseInvestigation = lazy(() =>
  import('./features/releases/Investigations').then((m) => ({ default: m.ChooseInvestigation })),
);

export default function App() {
  return (
    <Suspense fallback={<Loading label="Loading…" />}>
      <Routes>
        {/* ---- Public marketing ---- */}
        <Route path="/" element={<Landing />} />
        <Route path="/login" element={<Login />} />

        {/* /demo is the link that goes on a résumé: it drops straight
            into a populated workspace with no sign-in. */}
        <Route path="/demo" element={<Navigate to={`/r/${DEMO_REPO}/delivery`} replace />} />

        {/* ---- Product surfaces ---- */}
        <Route element={<ProductLayout />}>
          <Route path="/r/:repoId/delivery" element={<DeliveryPage />} />
          <Route path="/r/:repoId/runs/:runNumber" element={<RunPage />} />
          <Route path="/r/:repoId/impact" element={<ImpactPage />} />
          <Route path="/r/:repoId/flakes" element={<FlakesPage />} />
          <Route path="/r/:repoId" element={<Navigate to="delivery" replace />} />
          <Route path="/benchmark" element={<BenchmarkPage />} />
          <Route path="/documentation" element={<Documentation />} />
          <Route path="/recorded" element={<ReleaseDetail recorded />} />
        </Route>

        {/* ---- Authenticated workspace ---- */}
        <Route element={<RequireAuth />}>
          <Route element={<AppLayout />}>
            <Route path="/dashboard" element={<Navigate to="/repositories" replace />} />
            <Route path="/incidents" element={<Incidents />} />
            <Route path="/incidents/:id" element={<IncidentDetail />} />
            <Route path="/services" element={<Services />} />
            <Route path="/services/:id" element={<ServiceDetail />} />
            <Route path="/account" element={<Account />} />
            <Route path="/investigations" element={<InvestigationHome />} />
            <Route path="/investigations/new" element={<ChooseInvestigation />} />
            <Route path="/repositories" element={<Repositories />} />
            <Route path="/repositories/:id" element={<RepositoryWorkspace />} />
            <Route path="/repositories/:id/tools" element={<RepositoryTools />} />
            <Route path="/repositories/:id/delivery" element={<Delivery />} />
            <Route path="/repositories/:id/investigate" element={<Investigations />} />
            <Route path="/repositories/:id/changes" element={<ChangePublisher />} />
            <Route path="/repositories/:id/releases/:runId" element={<ReleaseDetail />} />
            <Route path="/agents" element={<Agents />} />
            <Route path="/activity" element={<Agents />} />
            <Route path="/evaluations" element={<Evaluations />} />
            <Route path="/settings" element={<Settings />} />
            <Route path="/demo-simulator" element={<Demo />} />
          </Route>
        </Route>

        <Route
          path="*"
          element={
            <div className="state" style={{ minHeight: '70vh' }}>
              <h1>Page not found</h1>
              <p>That route does not exist.</p>
              <div className="state-actions">
                <a className="btn btn-primary" href={`/r/${DEMO_REPO}/delivery`}>
                  Open the demo workspace
                </a>
                <a className="btn btn-outline" href="/">
                  Back to the homepage
                </a>
              </div>
            </div>
          }
        />
      </Routes>
    </Suspense>
  );
}
