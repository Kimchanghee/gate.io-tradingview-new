import React from 'react';
import Header from './components/Header';
import PromoBanner from './components/PromoBanner';  // ← 이 줄 추가
import ApiSettingsCard from './components/ApiSettingsCard';
import GlobalTradingSettingsCard from './components/GlobalTradingSettingsCard';
import PositionDashboard from './components/PositionDashboard';
import WebhookCard from './components/WebhookCard';
import LogsCard from './components/LogsCard';
import NotificationHandler from './components/NotificationHandler';

const App: React.FC = () => {
    return (
        <>
            <div className="min-h-screen bg-gradient-to-br from-gate-dark to-gate-secondary text-gate-text font-sans p-5">
                <div className="container mx-auto max-w-7xl">
                    <Header />
                    
                    {/* 프로모션 배너 */}
                    <PromoBanner />  {/* ← 이 줄 추가 */}
                    
                    <main>
                        {/* 첫 번째 줄: API 설정과 거래 설정 */}
                        <div className="grid grid-cols-1 lg:grid-cols-2 gap-5 mb-5">
                            <ApiSettingsCard />
                            <GlobalTradingSettingsCard />
                        </div>
                        
                        {/* 두 번째 줄: 포지션 대시보드 */}
                        <div className="mb-5">
                            <PositionDashboard />
                        </div>
                        
                        {/* 세 번째 줄: 웹훅 설정 */}
                        <div className="mb-5">
                            <WebhookCard />
                        </div>
                        
                        {/* 네 번째 줄: 로그 */}
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