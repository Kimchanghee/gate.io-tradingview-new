import React, { useMemo } from 'react';
import Header from './components/Header';
import PromoBanner from './components/PromoBanner';
import ApiSettingsCard from './components/ApiSettingsCard';
import PositionDashboard from './components/PositionDashboard';
import LogsCard from './components/LogsCard';
import NotificationHandler from './components/NotificationHandler';
import AdminApp from './components/AdminApp';
import RegistrationCard from './components/RegistrationCard';
import SignalFeedCard from './components/SignalFeedCard';
import UsageGuide from './components/UsageGuide';

const App: React.FC = () => {
  const isAdminRoute = useMemo(() => typeof window !== 'undefined' && window.location.pathname.startsWith('/admin'), []);

  if (isAdminRoute) {
    return <AdminApp />;
  }

  return (
    <>
      <div className="min-h-screen bg-gradient-to-br from-gate-dark to-gate-secondary text-gate-text font-sans p-5">
        <div className="container mx-auto max-w-7xl">
          <Header />
          <PromoBanner />
          <UsageGuide />

          <main>
            <RegistrationCard />
            <SignalFeedCard />

            <div className="mb-5">
              <ApiSettingsCard />
            </div>

            <div className="mb-5">
              <PositionDashboard />
            </div>

            <div className="mb-5">
              <LogsCard />
            </div>
          </main>
        </div>
      </div>
      <NotificationHandler />
    </>
  );
};

export default App;
