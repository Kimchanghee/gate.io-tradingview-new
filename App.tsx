import React from 'react';
import Header from './components/Header';
import ApiSettingsCard from './components/ApiSettingsCard';
import GlobalTradingSettingsCard from './components/GlobalTradingSettingsCard';
import WebhookCard from './components/WebhookCard';
import LogsCard from './components/LogsCard';
import NotificationHandler from './components/NotificationHandler';

const App: React.FC = () => {
    return (
        <>
            <div className="min-h-screen bg-gradient-to-br from-gate-dark to-gate-secondary text-gate-text font-sans p-5">
                <div className="container mx-auto max-w-7xl">
                    <Header />
                    <main>
                        <div className="grid grid-cols-1 lg:grid-cols-2 gap-5 mb-5">
                            <ApiSettingsCard />
                            <GlobalTradingSettingsCard />
                        </div>
                        <div className="mb-5">
                            <WebhookCard />
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