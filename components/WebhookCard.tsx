import React, { useState } from 'react';
import Card from './Card';
import { useAppContext } from '../contexts/AppContext';
import { LogType } from '../types';
import { BACKEND_URL, WEBHOOK_URL } from '../config';

const CopyIcon = () => (
    <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
    </svg>
);

const WebhookCard: React.FC = () => {
    const { state, dispatch, translate } = useAppContext();
    const [copied, setCopied] = useState(false);

    const copyToClipboard = () => {
        navigator.clipboard.writeText(WEBHOOK_URL).then(() => {
            setCopied(true);
            dispatch({ type: 'ADD_LOG', payload: { 
                message: `📋 ${translate('urlCopied')}: ${WEBHOOK_URL}`, 
                type: LogType.Info 
            } });
            setTimeout(() => setCopied(false), 2000);
        }).catch(() => {
            dispatch({ type: 'ADD_LOG', payload: { 
                message: `❌ ${translate('connectionFailed')}`, 
                type: LogType.Error 
            } });
        });
    };

    const handleWebhookControl = async (action: 'start' | 'stop') => {
        try {
            console.log(`🔄 Webhook ${action} 요청:`, `${BACKEND_URL}/api/webhook/${action}`);
            
            const response = await fetch(`${BACKEND_URL}/api/webhook/${action}`, { 
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                }
            });
            
            if (!response.ok) {
                const errorData = await response.json().catch(() => ({ message: 'Unknown error' }));
                throw new Error(errorData.message || `HTTP ${response.status}`);
            }
            
            const data = await response.json();
            console.log(`✅ Webhook ${action} 성공:`, data);
            
            const newStatus = action === 'start';
            dispatch({ type: 'SET_WEBHOOK_STATUS', payload: newStatus });
            
            const message = translate(newStatus ? 'webhookStarted' : 'webhookStopped');
            dispatch({ type: 'ADD_LOG', payload: { 
                message: `${newStatus ? '🚀' : '🛑'} ${message}`, 
                type: LogType.Success 
            } });
            dispatch({ type: 'ADD_NOTIFICATION', payload: { 
                message, 
                type: 'success' 
            } });
            
        } catch (error) {
            console.error(`❌ Webhook ${action} 실패:`, error);
            const errorMessage = (error as Error).message;
            
            dispatch({ type: 'ADD_LOG', payload: { 
                message: `❌ Webhook ${action} failed: ${errorMessage}`, 
                type: LogType.Error 
            } });
            dispatch({ type: 'ADD_NOTIFICATION', payload: { 
                message: `Webhook ${action} failed: ${errorMessage}`, 
                type: 'error' 
            } });
        }
    };

    return (
        <Card title={translate('webhookSettings')}>
            <div className="space-y-5">
                {/* Webhook URL 섹션 */}
                <div className="bg-gate-dark p-4 rounded-xl border border-gate-border">
                    <p className="text-sm text-gate-text-secondary mb-4">
                        {translate('webhookDescription')}
                    </p>
                    <p className="text-xs text-blue-400 mb-3">
                        {translate('webhookUrlDesc')}
                    </p>
                    <div className="flex items-center gap-2">
                        <input 
                            type="text" 
                            readOnly 
                            value={WEBHOOK_URL}
                            className="flex-1 p-2 bg-slate-900 border border-gate-border rounded-lg font-mono text-xs select-all"
                        />
                        <button 
                            onClick={copyToClipboard} 
                            className="p-2 bg-gate-primary text-gate-dark rounded-lg hover:bg-green-500 transition-colors text-xs font-bold flex items-center gap-1"
                        >
                            <CopyIcon/> 
                            {copied ? translate('copied') : translate('copy')}
                        </button>
                    </div>
                </div>

                {/* Webhook 상태 표시 */}
                <div className="flex items-center gap-2 p-3 bg-gate-dark rounded-lg">
                    <span className="text-sm text-gate-text-secondary">{translate('webhookStatus')}</span>
                    <span className={`text-sm font-bold flex items-center gap-2 ${
                        state.webhookActive ? 'text-green-400' : 'text-gray-400'
                    }`}>
                        <span className={`w-2 h-2 rounded-full ${
                            state.webhookActive ? 'bg-green-400 animate-pulse' : 'bg-gray-400'
                        }`}></span>
                        {state.webhookActive ? translate('activated') : translate('deactivated')}
                    </span>
                </div>

                {/* TradingView Alert JSON 예시 */}
                <div className="bg-gate-dark p-4 rounded-xl border border-gate-border">
                    <p className="text-sm text-gate-text-secondary mb-3">
                        📋 {translate('webhookJsonExample')}
                    </p>
                    <div className="bg-slate-900 p-3 rounded-lg">
                        <pre className="text-xs text-green-400 overflow-x-auto">
{`// TradingView 파인스크립트 신호 형식
{
  "signal": "LONG ENTER",
  "symbol": "{{ticker}}"
}

// 또는 상세 설정 포함
{
  "signal": "SHORT ENTER",
  "symbol": "{{ticker}}",
  "size": 100,
  "leverage": 10
}

// 포지션 종료 신호
{
  "signal": "LONG EXIT",
  "symbol": "{{ticker}}"
}`}
                        </pre>
                    </div>
                    <div className="mt-2 text-xs text-gray-400">
                        <p>✅ 지원되는 신호: LONG ENTER, SHORT ENTER, LONG EXIT, SHORT EXIT</p>
                        <p>✅ 심볼은 자동으로 Gate.io 형식으로 변환됩니다</p>
                        <p>✅ size와 leverage는 선택사항 (기본값 사용)</p>
                    </div>
                </div>

                {/* 제어 버튼들 */}
                <div className="grid grid-cols-2 gap-4">
                    <button 
                        onClick={() => handleWebhookControl('start')}
                        disabled={state.webhookActive}
                        className="p-3 bg-gate-primary text-gate-dark rounded-xl font-bold uppercase tracking-wider transition-colors disabled:opacity-50 disabled:cursor-not-allowed hover:bg-green-500"
                    >
                        {translate('startWebhook')}
                    </button>
                    <button 
                        onClick={() => handleWebhookControl('stop')}
                        disabled={!state.webhookActive}
                        className="p-3 bg-gate-danger text-white rounded-xl font-bold uppercase tracking-wider transition-colors disabled:opacity-50 disabled:cursor-not-allowed hover:bg-red-500"
                    >
                        {translate('stopWebhook')}
                    </button>
                </div>

                {/* 도움말 */}
                <div className="p-3 bg-blue-500/10 border border-blue-500/30 rounded-lg">
                    <p className="text-sm text-blue-400 flex items-center gap-2">
                        <span>💡</span>
                        {translate('webhookHint')}
                    </p>
                </div>
            </div>
        </Card>
    );
};

export default WebhookCard;