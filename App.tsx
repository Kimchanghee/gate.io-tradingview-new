import React, { useEffect, useMemo } from 'react';
import Header from './components/Header';
import PromoBanner from './components/PromoBanner';
import ApiSettingsCard from './components/ApiSettingsCard';
import PositionDashboard from './components/PositionDashboard';
import NotificationHandler from './components/NotificationHandler';
import AdminApp from './components/AdminApp';
import RegistrationCard from './components/RegistrationCard';
import SignalFeedCard from './components/SignalFeedCard';
import UsageGuide from './components/UsageGuide';
import TradingSettingsCard from './components/TradingSettingsCard';

const App: React.FC = () => {
  const isAdminRoute = useMemo(() => typeof window !== 'undefined' && window.location.pathname.startsWith('/admin'), []);

  useEffect(() => {
    if (typeof window === 'undefined') {
      return undefined;
    }

    const sessionStorageKey = 'gate_visit_session';
    const createSessionId = () => {
      if (window.crypto?.randomUUID) {
        return window.crypto.randomUUID();
      }
      return `visit_${Math.random().toString(36).slice(2, 12)}`;
    };

    const resolveSessionId = () => {
      try {
        const stored = window.localStorage.getItem(sessionStorageKey);
        if (stored) {
          return stored;
        }
      } catch (err) {
        console.error('Failed to read stored session id', err);
      }
      const generated = createSessionId();
      try {
        window.localStorage.setItem(sessionStorageKey, generated);
      } catch (err) {
        console.error('Failed to persist session id', err);
      }
      return generated;
    };

    let currentSessionId = resolveSessionId();

    const sendVisit = async () => {
      try {
        const response = await fetch('/api/metrics/visit', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            sessionId: currentSessionId,
            path: `${window.location.pathname}${window.location.search}`,
            referrer: document.referrer || '',
          }),
        });
        if (response.ok) {
          const data = await response.json();
          if (data?.sessionId && data.sessionId !== currentSessionId) {
            currentSessionId = data.sessionId;
            try {
              window.localStorage.setItem(sessionStorageKey, currentSessionId);
            } catch (err) {
              console.error('Failed to persist normalized session id', err);
            }
          }
        }
      } catch (err) {
        console.error('Failed to send visit metrics', err);
      }
    };

    void sendVisit();
    const visibilityHandler = () => {
      if (document.visibilityState === 'visible') {
        void sendVisit();
      }
    };
    document.addEventListener('visibilitychange', visibilityHandler);
    const intervalId = window.setInterval(() => {
      void sendVisit();
    }, 60_000);

    return () => {
      document.removeEventListener('visibilitychange', visibilityHandler);
      window.clearInterval(intervalId);
    };
  }, []);

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
            <TradingSettingsCard />
            <SignalFeedCard />

            <div className="mb-5">
              <ApiSettingsCard />
            </div>

            <div className="mb-5">
              <PositionDashboard />
            </div>

          </main>
        </div>
      </div>
      <NotificationHandler />
    </>
  );
};

export default App;
