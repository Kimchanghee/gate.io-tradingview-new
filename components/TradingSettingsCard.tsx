
import React, { useState, useEffect } from 'react';
import Card from './Card';
import { useAppContext } from '../contexts/AppContext';
import { SYMBOLS, SYMBOL_CONFIG, DEFAULT_MAX_LEVERAGE } from '../constants';
import { LogType } from '../types';

const TradingSettingsCard: React.FC = () => {
    const { state, dispatch, translate } = useAppContext();
    const [symbol, setSymbol] = useState(state.settings.symbol);
    const [amount, setAmount] = useState(state.settings.investmentAmount);
    const [leverage, setLeverage] = useState(state.settings.leverage);

    const accountSummary = state.accountSummary;
    const availableBalance = accountSummary?.futuresAvailable ?? 0;
    const isAccountConnected = accountSummary?.isConnected ?? false;
    const selectedSymbol = symbol || state.settings.symbol;
    const maxLeverage = SYMBOL_CONFIG[selectedSymbol]?.maxLeverage ?? DEFAULT_MAX_LEVERAGE;

    useEffect(() => {
        setSymbol(state.settings.symbol);
        setAmount(state.settings.investmentAmount);
        const maxForSymbol = SYMBOL_CONFIG[state.settings.symbol]?.maxLeverage ?? DEFAULT_MAX_LEVERAGE;
        const nextLeverage = Math.min(state.settings.leverage, maxForSymbol);
        setLeverage(nextLeverage);
    }, [state.settings]);

    const handleSave = () => {
        const maxForSymbol = SYMBOL_CONFIG[symbol]?.maxLeverage ?? DEFAULT_MAX_LEVERAGE;
        const clampedLeverage = Math.min(Math.max(Number(leverage) || 1, 1), maxForSymbol);
        const newSettings = {
            symbol,
            investmentAmount: Number(amount),
            leverage: clampedLeverage,
        };
        dispatch({ type: 'UPDATE_SETTINGS', payload: newSettings });
        localStorage.setItem('gateio_settings', JSON.stringify({ ...state.settings, ...newSettings }));
        dispatch({ type: 'ADD_NOTIFICATION', payload: { message: translate('settingsSaved'), type: 'success' } });
        dispatch({ type: 'ADD_LOG', payload: { message: translate('settingsSaved'), type: LogType.Success } });
    };

    const formattedAvailable = new Intl.NumberFormat('en-US', {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
    }).format(Math.max(0, availableBalance));

    const leverageWarning = leverage > maxLeverage;
    const amountWarning = amount > availableBalance && isAccountConnected;

    return (
        <Card title={translate('tradingSettings')}>
            <div className="space-y-5">
                <div className="p-3 bg-black/30 rounded-xl border border-gray-700">
                    <div className="text-sm font-semibold text-gate-text">{translate('autoTrading')}</div>
                    <div className="text-xs text-gray-400">{translate('autoTradeSettingsDescription')}</div>
                    <div className="mt-3 grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm text-gray-300">
                        <div>
                            <div className="text-gray-400 text-xs uppercase tracking-wider">{translate('symbol')}</div>
                            <div className="text-base font-semibold text-gate-primary">{selectedSymbol}</div>
                        </div>
                        <div>
                            <div className="text-gray-400 text-xs uppercase tracking-wider">{translate('available')}</div>
                            <div className="text-base font-semibold text-gate-primary">{formattedAvailable} USDT</div>
                        </div>
                    </div>
                    {!isAccountConnected && (
                        <div className="mt-3 text-xs text-yellow-200 bg-yellow-900/20 border border-yellow-500/40 rounded-lg px-3 py-2">
                            {translate('autoTradeRequiresConnection')}
                        </div>
                    )}
                    {state.user.autoTradingEnabled ? (
                        <div className="mt-3 text-xs text-green-300 bg-green-900/20 border border-green-500/40 rounded-lg px-3 py-2">
                            {translate('autoTradeMonitoring')}
                        </div>
                    ) : (
                        <div className="mt-3 text-xs text-gray-300 bg-gray-800/40 border border-gray-600/60 rounded-lg px-3 py-2">
                            {translate('autoTradeDisabledHint')}
                        </div>
                    )}
                </div>
                <div>
                    <label className="block mb-2 text-sm text-gate-text-secondary">{translate('symbol')}</label>
                    <select
                        value={symbol}
                        onChange={(e) => setSymbol(e.target.value)}
                        className="w-full p-3 bg-gate-dark border-2 border-gate-border rounded-xl focus:outline-none focus:border-gate-primary transition-colors"
                    >
                        {SYMBOLS.map(s => <option key={s} value={s}>{s}</option>)}
                    </select>
                </div>
                <div>
                    <label className="block mb-2 text-sm text-gate-text-secondary">{translate('investmentAmount')}</label>
                    <input
                        type="number"
                        value={amount}
                        onChange={(e) => setAmount(Number(e.target.value))}
                        min="10"
                        step="10"
                        className="w-full p-3 bg-gate-dark border-2 border-gate-border rounded-xl focus:outline-none focus:border-gate-primary transition-colors"
                    />
                    {amountWarning && (
                        <div className="mt-2 text-xs text-yellow-200 bg-yellow-900/30 border border-yellow-500/40 rounded-lg px-3 py-2">
                            {translate('autoTradeInsufficientFunds')}
                        </div>
                    )}
                </div>
                <div>
                    <label className="block mb-2 text-sm text-gate-text-secondary">{translate('leverage')}</label>
                    <div className="leverage-display text-center text-2xl font-bold text-gate-primary my-2">{leverage}x</div>
                    <div className="text-xs text-gray-400 text-center mb-2">≤ {maxLeverage}x</div>
                    <input
                        type="range"
                        min="1"
                        max={maxLeverage}
                        value={leverage}
                        onChange={(e) => setLeverage(Number(e.target.value))}
                        className="w-full h-2 bg-gate-dark rounded-lg appearance-none cursor-pointer range-lg [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-5 [&::-webkit-slider-thumb]:h-5 [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-gate-primary"
                    />
                    {leverageWarning && (
                        <div className="mt-2 text-xs text-red-300 bg-red-900/30 border border-red-500/40 rounded-lg px-3 py-2">
                            {translate('autoTradeInvalidLeverage')} ({maxLeverage}x {selectedSymbol})
                        </div>
                    )}
                </div>
                <button
                    onClick={handleSave}
                    className="w-full p-3 bg-gate-dark border-2 border-gate-border rounded-xl font-bold text-gate-text hover:border-gate-primary hover:text-gate-primary transition-all duration-300"
                >
                    {translate('saveSettings')}
                </button>
            </div>
        </Card>
    );
};

export default TradingSettingsCard;
