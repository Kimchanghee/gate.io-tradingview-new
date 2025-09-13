
import React, { useState, useEffect } from 'react';
import Card from './Card';
import { useAppContext } from '../contexts/AppContext';
import { SYMBOLS } from '../constants';
import { LogType } from '../types';

const TradingSettingsCard: React.FC = () => {
    const { state, dispatch, translate } = useAppContext();
    const [symbol, setSymbol] = useState(state.settings.symbol);
    const [amount, setAmount] = useState(state.settings.investmentAmount);
    const [leverage, setLeverage] = useState(state.settings.leverage);

    useEffect(() => {
        setSymbol(state.settings.symbol);
        setAmount(state.settings.investmentAmount);
        setLeverage(state.settings.leverage);
    }, [state.settings]);

    const handleSave = () => {
        const newSettings = {
            symbol,
            investmentAmount: Number(amount),
            leverage: Number(leverage),
        };
        dispatch({ type: 'UPDATE_SETTINGS', payload: newSettings });
        localStorage.setItem('gateio_settings', JSON.stringify({ ...state.settings, ...newSettings }));
        dispatch({ type: 'ADD_NOTIFICATION', payload: { message: translate('settingsSaved'), type: 'success' } });
        dispatch({ type: 'ADD_LOG', payload: { message: translate('settingsSaved'), type: LogType.Success } });
    };

    return (
        <Card title={translate('tradingSettings')}>
            <div className="space-y-5">
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
                </div>
                <div>
                    <label className="block mb-2 text-sm text-gate-text-secondary">{translate('leverage')}</label>
                    <div className="leverage-display text-center text-2xl font-bold text-gate-primary my-2">{leverage}x</div>
                    <input 
                        type="range" 
                        min="1" 
                        max="125"
                        value={leverage}
                        onChange={(e) => setLeverage(Number(e.target.value))}
                        className="w-full h-2 bg-gate-dark rounded-lg appearance-none cursor-pointer range-lg [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-5 [&::-webkit-slider-thumb]:h-5 [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-gate-primary"
                    />
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
