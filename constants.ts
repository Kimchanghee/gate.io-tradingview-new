export const SYMBOLS = ["BTC_USDT", "ETH_USDT", "SOL_USDT", "BNB_USDT", "XRP_USDT"];

export interface SymbolConfig {
  maxLeverage: number;
}

export const SYMBOL_CONFIG: Record<string, SymbolConfig> = {
  BTC_USDT: { maxLeverage: 125 },
  ETH_USDT: { maxLeverage: 100 },
  SOL_USDT: { maxLeverage: 50 },
  BNB_USDT: { maxLeverage: 75 },
  XRP_USDT: { maxLeverage: 50 },
};

export const DEFAULT_MAX_LEVERAGE = 50;
