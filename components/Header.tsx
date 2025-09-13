
import React from 'react';
import { useAppContext } from '../contexts/AppContext';
import { Network, Language } from '../types';

const LightningIcon: React.FC = () => (
    <svg xmlns="http://www.w3.org/2000/svg" className="h-8 w-8 text-gate-primary" viewBox="0 0 20 20" fill="currentColor">
        <path fillRule="evenodd" d="M11.3 1.046A1 1 0 0112 2v5.268l4.066-4.067a1 1 0 011.414 1.414l-4.067 4.066H19a1 1 0 01.954 1.285l-5 10A1 1 0 0114 19v-5.268l-4.066 4.067a1 1 0 01-1.414-1.414l4.067-4.066H1a1 1 0 01-.954-1.285l5-10A1 1 0 016 1h5.3z" clipRule="evenodd" />
    </svg>
);

const Header: React.FC = () => {
    const { state, dispatch, translate } = useAppContext();

    const handleNetworkChange = (network: Network) => {
        dispatch({ type: 'SET_NETWORK', payload: network });
    };

    const handleLanguageChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
        dispatch({ type: 'SET_LANGUAGE', payload: e.target.value as Language });
    };

    return (
        <header className="bg-gate-card rounded-2xl p-5 mb-8 shadow-2xl flex justify-between items-center flex-wrap gap-4">
            <div className="flex items-center gap-3">
                <LightningIcon />
                <h1 className="text-xl font-bold text-gate-primary">{translate('logo')}</h1>
            </div>
            <div className="flex items-center gap-4 flex-wrap">
                <select 
                    value={state.language}
                    onChange={handleLanguageChange}
                    className="bg-gate-dark border-2 border-gate-border text-gate-text px-4 py-2 rounded-xl text-sm cursor-pointer transition-all duration-300 hover:border-gate-primary focus:outline-none focus:ring-2 focus:ring-gate-primary"
                >
                    <option value="ko">한국어</option>
                    <option value="en">English</option>
                    <option value="ja">日本語</option>
                </select>
                <div className="flex bg-gate-dark rounded-xl p-1">
                    <button 
                        onClick={() => handleNetworkChange(Network.Testnet)}
                        className={`px-5 py-1.5 rounded-lg text-sm transition-all duration-300 ${state.network === Network.Testnet ? 'bg-gate-primary text-gate-dark font-bold' : 'text-gate-text-secondary'}`}
                    >
                        {translate('testnet')}
                    </button>
                    <button 
                        onClick={() => handleNetworkChange(Network.Mainnet)}
                        className={`px-5 py-1.5 rounded-lg text-sm transition-all duration-300 ${state.network === Network.Mainnet ? 'bg-gate-primary text-gate-dark font-bold' : 'text-gate-text-secondary'}`}
                    >
                        {translate('mainnet')}
                    </button>
                </div>
            </div>
        </header>
    );
};

export default Header;
