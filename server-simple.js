const express = require('express');
const app = express();

// Cloud Run이 설정하는 PORT 환경변수 사용
const PORT = process.env.PORT || 8080;

// 미들웨어
app.use(express.json());

// Health check endpoint - Cloud Run이 확인하는 엔드포인트
app.get('/health', (req, res) => {
    res.status(200).json({ status: 'healthy', timestamp: new Date().toISOString() });
});

// Root endpoint
app.get('/', (req, res) => {
    res.json({ 
        message: 'Gate.io Trading Bot is running',
        port: PORT,
        timestamp: new Date().toISOString()
    });
});

// Webhook endpoint
app.post('/webhook', (req, res) => {
    console.log('Webhook received:', req.body);
    res.json({ 
        status: 'received',
        body: req.body 
    });
});

// 0.0.0.0에 바인딩하여 모든 네트워크 인터페이스에서 수신
app.listen(PORT, '0.0.0.0', () => {
    console.log(`Server is running on http://0.0.0.0:${PORT}`);
    console.log(`Health check available at http://0.0.0.0:${PORT}/health`);
});
