const logger = require('../utils/logger');
const axios = require('axios');

class NotificationService {
    constructor() {
        this.telegramEnabled = !!process.env.TELEGRAM_BOT_TOKEN;
        this.discordEnabled = !!process.env.DISCORD_WEBHOOK_URL;
        
        this.telegramToken = process.env.TELEGRAM_BOT_TOKEN;
        this.telegramChatId = process.env.TELEGRAM_CHAT_ID;
        this.discordWebhook = process.env.DISCORD_WEBHOOK_URL;
    }

    async sendTradeNotification(signal, result) {
        const message = this.formatTradeMessage(signal, result);
        
        await Promise.all([
            this.sendTelegram(message),
            this.sendDiscord(message),
            this.sendWebSocket(signal, result)
        ]);
    }

    async sendAlert(title, message) {
        const alertMessage = `🚨 **${title}**\n${message}`;
        
        await Promise.all([
            this.sendTelegram(alertMessage),
            this.sendDiscord(alertMessage)
        ]);
    }

    formatTradeMessage(signal, result) {
        const emoji = signal.action === 'buy' ? '📈' : '📉';
        const status = result.success ? '✅ Success' : '❌ Failed';
        
        return `
${emoji} **Trade Executed**
${status}

**Symbol:** ${signal.symbol}
**Action:** ${signal.action.toUpperCase()}
**Amount:** ${signal.amount || 'Market'}
**Price:** ${result.price || 'Market'}
**Order ID:** ${result.orderId}
**Time:** ${new Date().toLocaleString()}
${signal.comment ? `**Comment:** ${signal.comment}` : ''}
        `.trim();
    }

    async sendTelegram(message) {
        if (!this.telegramEnabled) return;
        
        try {
            const url = `https://api.telegram.org/bot${this.telegramToken}/sendMessage`;
            await axios.post(url, {
                chat_id: this.telegramChatId,
                text: message,
                parse_mode: 'Markdown'
            });
            logger.debug('Telegram notification sent');
        } catch (error) {
            logger.error('Telegram notification error:', error.message);
        }
    }

    async sendDiscord(message) {
        if (!this.discordEnabled) return;
        
        try {
            await axios.post(this.discordWebhook, {
                content: message
            });
            logger.debug('Discord notification sent');
        } catch (error) {
            logger.error('Discord notification error:', error.message);
        }
    }

    async sendWebSocket(signal, result) {
        if (global.io) {
            global.io.emit('trade', {
                signal,
                result,
                timestamp: new Date().toISOString()
            });
        }
    }

    async sendDailySummary(stats) {
        const message = `
📊 **Daily Trading Summary**

**Date:** ${stats.date}
**Total Trades:** ${stats.trades}
**Successful:** ${stats.successful}
**Failed:** ${stats.failed}
**Total Profit/Loss:** ${stats.pnl > 0 ? '+' : ''}${stats.pnl.toFixed(2)} USDT
**Win Rate:** ${stats.winRate}%

**Top Performers:**
${stats.topPerformers.map(p => `• ${p.symbol}: +${p.profit.toFixed(2)} USDT`).join('\n')}

**Worst Performers:**
${stats.worstPerformers.map(p => `• ${p.symbol}: ${p.loss.toFixed(2)} USDT`).join('\n')}
        `.trim();
        
        await this.sendAlert('Daily Summary', message);
    }
}

module.exports = new NotificationService();
