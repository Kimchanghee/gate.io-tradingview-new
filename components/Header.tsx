import React from 'react';
import { useAppContext } from '../contexts/AppContext';
import { useTheme } from '../contexts/ThemeContext';
import { Network, Language } from '../types';

const LightningIcon: React.FC = () => (
    <svg
        xmlns="http://www.w3.org/2000/svg"
        className="h-7 w-7 text-gate-primary sm:h-8 sm:w-8"
        viewBox="0 0 20 20"
        fill="currentColor"
    >
        <path
            fillRule="evenodd"
            d="M11.3 1.046A1 1 0 0112 2v5.268l4.066-4.067a1 1 0 011.414 1.414l-4.067 4.066H19a1 1 0 01.954 1.285l-5 10A1 1 0 0114 19v-5.268l-4.066 4.067a1 1 0 01-1.414-1.414l4.067-4.066H1a1 1 0 01-.954-1.285l5-10A1 1 0 016 1h5.3z"
            clipRule="evenodd"
        />
    </svg>
);

const SunIcon: React.FC = () => (
    <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 3v1m0 16v1m9-9h-1M4 12H3m15.364 6.364l-.707-.707M6.343 6.343l-.707-.707m12.728 0l-.707.707M6.343 17.657l-.707.707M16 12a4 4 0 11-8 0 4 4 0 018 0z" />
    </svg>
);

const MoonIcon: React.FC = () => (
    <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20.354 15.354A9 9 0 018.646 3.646 9.003 9.003 0 0012 21a9.003 9.003 0 008.354-5.646z" />
    </svg>
);

const Header: React.FC = () => {
    const { state, dispatch, translate } = useAppContext();
    const { theme, toggleTheme } = useTheme();

    const handleNetworkChange = (network: Network) => {
        dispatch({ type: 'SET_NETWORK', payload: network });
    };

    const handleLanguageChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
        dispatch({ type: 'SET_LANGUAGE', payload: e.target.value as Language });
    };

    return (
        <header className="bg-gate-card rounded-2xl p-4 mb-6 shadow-2xl sm:p-5">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                <div className="flex items-center gap-3">
                    <LightningIcon />
                    <h1 className="text-lg font-bold text-gate-primary sm:text-xl">{translate('logo')}</h1>
                </div>
                <div className="flex w-full flex-col gap-3 sm:w-auto sm:flex-row sm:items-center sm:justify-end">
                    <div className="flex items-center justify-end gap-2 sm:gap-3">
                        <button
                            onClick={toggleTheme}
                            className="rounded-xl bg-gate-dark p-2 transition-colors hover:bg-gate-secondary"
                            title={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
                        >
                            {theme === 'dark' ? <SunIcon /> : <MoonIcon />}
                        </button>

                        <select
                            value={state.language}
                            onChange={handleLanguageChange}
                            className="w-full cursor-pointer rounded-xl border-2 border-gate-border bg-gate-dark px-4 py-2 text-sm text-gate-text transition-all duration-300 hover:border-gate-primary focus:outline-none focus:ring-2 focus:ring-gate-primary sm:w-auto"
                        >
                            <option value="ko">한국어</option>
                            <option value="en">English</option>
                            <option value="ja">日本語</option>
                        </select>
                    </div>
                    <div className="grid w-full grid-cols-2 gap-2 rounded-xl bg-gate-dark p-1 sm:flex sm:w-auto sm:gap-0">
                        <button
                            onClick={() => handleNetworkChange(Network.Mainnet)}
                            className={`w-full rounded-lg px-4 py-1.5 text-sm transition-all duration-300 sm:w-auto sm:px-5 ${
                                state.network === Network.Mainnet
                                    ? 'bg-gate-primary text-gate-dark font-bold'
                                    : 'text-gate-text-secondary'
                            }`}
                        >
                            {translate('mainnet')}
                        </button>
                        <button
                            onClick={() => handleNetworkChange(Network.Testnet)}
                            className={`w-full rounded-lg px-4 py-1.5 text-sm transition-all duration-300 sm:w-auto sm:px-5 ${
                                state.network === Network.Testnet
                                    ? 'bg-gate-primary text-gate-dark font-bold'
                                    : 'text-gate-text-secondary'
                            }`}
                        >
                            {translate('testnet')}
                        </button>
                    </div>
                </div>
            </div>
        </header>
    );
};

export default Header;