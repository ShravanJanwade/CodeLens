import { Routes, Route, Navigate } from 'react-router-dom';
import { AppLayout } from './layouts/AppLayout';
import Landing from './pages/Landing';
import Incidents from './pages/Incidents';
import IncidentDetail from './pages/IncidentDetail';
import Services from './pages/Services';
import ServiceDetail from './pages/ServiceDetail';
import Repositories from './pages/Repositories';
import RepositoryTools from './features/repositories/RepositoryTools';
import Agents from './pages/Agents';
import Evaluations from './pages/Evaluations';
import Settings from './pages/Settings';
import Demo from './pages/Demo';
import Documentation from './pages/Documentation';
import RepositoryWorkspace from './features/repositories/RepositoryWorkspace';
import ReleaseDetail from './features/releases/ReleaseDetail';
import Login from './features/auth/Login';
import Account from './features/auth/Account';
import { RequireAuth } from './features/auth/Auth';
import OwnInvestigation, { InvestigationHome, ChooseInvestigation } from './features/releases/Investigations';
import Delivery from './features/repositories/Delivery';
import ChangePublisher from './features/repositories/ChangePublisher';

export default function App() {
  return (
    <>
      <Routes>
        {/* Public landing page — no sidebar */}
        <Route path="/" element={<Landing />} />
        <Route path="/login" element={<Login />} />
        <Route path="/about" element={<Landing />} />

        {/* App routes — with sidebar layout */}
        <Route element={<RequireAuth />}>
          <Route element={<AppLayout />}>
            <Route path="/dashboard" element={<Navigate to="/repositories" replace />} />
            <Route path="/incidents" element={<Incidents />} />
            <Route path="/incidents/:id" element={<IncidentDetail />} />
            <Route path="/services" element={<Services />} />
            <Route path="/services/:id" element={<ServiceDetail />} />
            <Route path="/account" element={<Account />} />
            <Route path="/investigations/new" element={<ChooseInvestigation />} />
            <Route path="/repositories" element={<Repositories />} />
            <Route path="/repositories/:id" element={<RepositoryWorkspace />} />
            <Route path="/repositories/:id/tools" element={<RepositoryTools />} />
            <Route path="/repositories/:id/delivery" element={<Delivery />} />
            <Route path="/repositories/:id/investigate" element={<OwnInvestigation />} />
            <Route path="/repositories/:id/changes" element={<ChangePublisher />} />
            <Route path="/repositories/:id/releases/:runId" element={<ReleaseDetail />} />
            <Route path="/investigations" element={<InvestigationHome />} />
            <Route path="/code-analysis" element={<Repositories />} />
            <Route path="/agents" element={<Agents />} />
            <Route path="/activity" element={<Agents />} />
            <Route path="/evaluations" element={<Evaluations />} />
            <Route path="/settings" element={<Settings />} />
            <Route path="/demo" element={<Demo />} />
            <Route
              path="*"
              element={
                <div className="state-panel">
                  <h1>Page not found</h1>
                  <a className="btn-primary" href="/repositories">
                    Back to repositories
                  </a>
                </div>
              }
            />
          </Route>
        </Route>
        <Route element={<AppLayout />}>
          <Route path="/recorded" element={<ReleaseDetail recorded />} />
          <Route path="/documentation" element={<Documentation />} />
        </Route>
      </Routes>
    </>
  );
}
