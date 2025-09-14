import React, { useState, useEffect } from 'react';
import Card from './Card';
import { useAppContext } from '../contexts/AppContext';

interface WebhookSignal {
  id: string;
  timestamp: string;
  signal: string;
  symbol: string;
  side?: string;
  size?: number;
  leverage?: number;
  status: 'pending' | 'executed' | 'failed';
}

const GlobalTradingSettingsCard: React.FC = () => {
  const { state, translate } = useAppContext();
  const [investmentAmount, setInvestmentAmount] = useState<number>(100);
  const [defaultLeverage, setDefaultLeverage] = useState<number>(10);
  const [autoTrading, setAutoTrading] = useState<boolean>(false);
  const [webhookSignals, setWebhookSignals] = useState<WebhookSignal[]>([]);

  // 다국어 텍스트
  const getLocalizedText = (key: string) => {
    const texts: any = {
      webhookSignals: {
        ko: '웹훅 신호',
        en: 'Webhook Signals',
        ja: 'Webhook シグナル'
      },
      noSignalsYet: {
        ko: '아직 수신된 신호가 없습니다',
        en: 'No signals received yet',
        ja: 'まだ信号を受信していません'
      },
      waitingForSignals: {
        ko: 'TradingView에서 신호를 기다리는 중...',
        en: 'Waiting for signals from TradingView...',
        ja: 'TradingViewからの信号を待機中...'
      },
      signal: {
        ko: '신호',
        en: 'Signal',
        ja: 'シグナル'
      },
      symbol: {
        ko: '심볼',
        en: 'Symbol',
        ja: 'シンボル'
      },
      side: {
        ko: '방향',
        en: 'Side',
        ja: '方向'
      },
      size: {
        ko: '수량',
        en: 'Size',
        ja: '数量'
      },
      leverage: {
        ko: '레버리지',
        en: 'Leverage',
        ja: 'レバレッジ'
      },
      status: {
        ko: '상태',
        en: 'Status',
        ja: 'ステータス'
      },
      pending: {
        ko: '대기중',
        en: 'Pending',
        ja: '保留中'
      },
      executed: {
        ko: '실행됨',
        en: 'Executed',
        ja: '実行済み'
      },
      failed: {
        ko: '실패',
        en: 'Failed',
        ja: '失敗'
      },
      clearAll: {
        ko: '모두 지우기',
        en: 'Clear All',
        ja: 'すべてクリア'
      }
    };
    
    return texts[key]?.[state.language] || texts[key]?.ko || '';
  };

   // 웹훅 신호 가져오기 부분 수정
   useEffect(() => {
   const savedSettings = localStorage.getItem('globalTradingSettings');
   if (savedSettings) {
       const settings = JSON.parse(savedSettings);
       setInvestmentAmount(settings.investmentAmount || 100);
       setDefaultLeverage(settings.defaultLeverage || 10);
       setAutoTrading(settings.autoTrading || false);
   }
   // 웹훅 ID 가져오기 또는 생성
   let webhookId = localStorage.getItem('webhook_id');
   if (!webhookId) {
       webhookId = 'wh_' + Math.random().toString(36).substr(2, 9) + Date.now().toString(36);
       localStorage.setItem('webhook_id', webhookId);
   }

   // 웹훅 신호 주기적으로 가져오기
   const fetchSignals = async () => {
       try {
       const response = await fetch(`/api/webhook/signals?id=${webhookId}`);
       if (response.ok) {
           const data = await response.json();
           setWebhookSignals(data.signals || []);
       }
       } catch (error) {
       console.error('웹훅 신호 조회 실패:', error);
       }
   };

   fetchSignals();
   const interval = setInterval(fetchSignals, 3000); // 3초마다 업데이트
   return () => clearInterval(interval);
   }, []);

  // 설정 저장
  const saveSettings = () => {
    const settings = {
      investmentAmount,
      defaultLeverage,
      autoTrading
    };
    localStorage.setItem('globalTradingSettings', JSON.stringify(settings));
    
    // 서버에도 설정 전송
    fetch('/api/settings', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(settings)
    }).catch(err => console.error('서버 설정 저장 실패:', err));
    
    // 성공 메시지 표시
    const button = document.getElementById('save-button');
    if (button) {
      const originalText = button.textContent;
      button.textContent = translate('saved');
      button.className = button.className.replace('bg-gate-primary', 'bg-green-600');
      setTimeout(() => {
        button.textContent = originalText;
        button.className = button.className.replace('bg-green-600', 'bg-gate-primary');
      }, 2000);
    }
  };

  // 신호 클리어
  const clearSignals = () => {
    setWebhookSignals([]);
  };

  // 시간 포맷
  const formatTime = (timestamp: string) => {
    try {
      const date = new Date(timestamp);
      return date.toLocaleTimeString('ko-KR', { 
        hour12: false, 
        hour: '2-digit', 
        minute: '2-digit', 
        second: '2-digit' 
      });
    } catch {
      return timestamp;
    }
  };

  return (
    <Card title={translate('tradingSettings')} className="space-y-4">
      {/* 상단: 기본 거래 설정 */}
      <div className="space-y-3 pb-4 border-b border-gray-600">
        {/* 자동 거래 토글 */}
        <div className="flex items-center justify-between p-2 bg-gate-secondary rounded-lg">
          <span className="text-sm font-medium text-gate-text">{translate('autoTrading')}</span>
          <label className="relative inline-flex items-center cursor-pointer">
            <input
              type="checkbox"
              checked={autoTrading}
              onChange={(e) => setAutoTrading(e.target.checked)}
              className="sr-only peer"
            />
            <div className="w-11 h-6 bg-gray-600 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-gate-primary"></div>
            <span className="ml-2 text-xs font-medium text-gray-400">
              {autoTrading ? translate('on') : translate('off')}
            </span>
          </label>
        </div>

        {/* 투자 설정 */}
        <div className="grid grid-cols-2 gap-2">
          <div>
            <label className="block text-xs text-gray-400 mb-1">
              {translate('defaultInvestmentAmount')}
            </label>
            <div className="relative">
              <input
                type="number"
                value={investmentAmount}
                onChange={(e) => setInvestmentAmount(Number(e.target.value))}
                className="w-full px-2 py-1.5 pr-12 bg-gate-secondary border border-gray-600 rounded text-sm text-gate-text focus:ring-1 focus:ring-gate-primary focus:border-transparent"
                min="1"
                step="10"
              />
              <span className="absolute right-2 top-1.5 text-xs text-gray-400">USDT</span>
            </div>
          </div>

          <div>
            <label className="block text-xs text-gray-400 mb-1">
              {translate('defaultLeverage')}
            </label>
            <div className="relative">
              <input
                type="number"
                value={defaultLeverage}
                onChange={(e) => setDefaultLeverage(Number(e.target.value))}
                className="w-full px-2 py-1.5 pr-8 bg-gate-secondary border border-gray-600 rounded text-sm text-gate-text focus:ring-1 focus:ring-gate-primary focus:border-transparent"
                min="1"
                max="125"
                step="1"
              />
              <span className="absolute right-2 top-1.5 text-xs text-gray-400">x</span>
            </div>
          </div>
        </div>

        {/* 저장 버튼 */}
        <button
          id="save-button"
          onClick={saveSettings}
          className="w-full py-1.5 px-3 bg-gate-primary text-white text-sm font-medium rounded hover:bg-opacity-90 transition-colors"
        >
          {translate('saveSettings')}
        </button>
      </div>

      {/* 하단: 웹훅 신호 표시 */}
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-semibold text-gate-text flex items-center gap-2">
            <span className="w-2 h-2 bg-green-500 rounded-full animate-pulse"></span>
            {getLocalizedText('webhookSignals')} ({webhookSignals.length})
          </h3>
          {webhookSignals.length > 0 && (
            <button
              onClick={clearSignals}
              className="text-xs text-red-400 hover:text-red-300"
            >
              {getLocalizedText('clearAll')}
            </button>
          )}
        </div>

        <div className="bg-gate-dark rounded-lg p-3 max-h-40 overflow-y-auto">
          {webhookSignals.length === 0 ? (
            <div className="text-center text-gray-500 text-xs py-4">
              <div>{getLocalizedText('noSignalsYet')}</div>
              <div className="text-xs mt-1 text-gray-600">
                {getLocalizedText('waitingForSignals')}
              </div>
            </div>
          ) : (
            <div className="space-y-2">
              {webhookSignals.slice(-5).reverse().map((signal) => (
                <div key={signal.id} className="flex items-center justify-between text-xs p-2 bg-gate-secondary rounded">
                  <div className="flex items-center gap-2">
                    <span className="text-gray-500">{formatTime(signal.timestamp)}</span>
                    <span className="font-semibold text-gate-text">{signal.symbol}</span>
                    <span className={`px-1.5 py-0.5 rounded text-xs ${
                      signal.signal.includes('LONG') || signal.signal.includes('BUY')
                        ? 'bg-green-900/50 text-green-400' 
                        : 'bg-red-900/50 text-red-400'
                    }`}>
                      {signal.signal}
                    </span>
                    {signal.leverage && (
                      <span className="text-gray-400">{signal.leverage}x</span>
                    )}
                  </div>
                  <span className={`px-1.5 py-0.5 rounded text-xs ${
                    signal.status === 'executed' ? 'bg-green-900/30 text-green-400' :
                    signal.status === 'failed' ? 'bg-red-900/30 text-red-400' :
                    'bg-yellow-900/30 text-yellow-400'
                  }`}>
                    {signal.status === 'executed' ? getLocalizedText('executed') :
                     signal.status === 'failed' ? getLocalizedText('failed') :
                     getLocalizedText('pending')}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </Card>
  );
};

export default GlobalTradingSettingsCard;