const verifyWebhookSecret = (req) => {
  const headerSecret = req.get('x-webhook-secret');
  const querySecret = req.params.secret || req.query.secret || req.body?.secret;
  if (!webhook.secret) return false;
  return headerSecret === webhook.secret || querySecret === webhook.secret;
};

app.post(['/webhook', '/webhook/:secret'], (req, res) => {
  if (webhook.secret && !verifyWebhookSecret(req)) {
    addLog('error', '[WEBHOOK] Received payload with invalid secret');
    return res.status(403).json({ ok: false, message: 'Invalid webhook secret.' });
  }

  const { indicator, strategy: strategyName, name, symbol, ticker, direction, side, action } =
    req.body || {};
  const resolvedIndicator = indicator || strategyName || name;
  const resolvedSymbol = symbol || ticker;
  const resolvedDirection = direction || side || action;

  if (!resolvedIndicator || !resolvedSymbol || !resolvedDirection) {
    addLog('error', '[WEBHOOK] Missing indicator, symbol or direction in payload');
    return res
      .status(400)
      .json({ ok: false, message: 'Indicator, symbol, and direction are required.' });
  }

  let strategy = matchStrategyByIndicator(resolvedIndicator);
  if (!strategy) {
    if (webhook.routes.size === 1) {
      const [onlyStrategy] = webhook.routes;
      strategy = strategies.get(onlyStrategy) || null;
    }
  }

  if (!strategy) {
    addLog('warning', `[WEBHOOK] Unknown indicator '${resolvedIndicator}'.`);
    return res
      .status(202)
      .json({ ok: false, message: 'No strategy matched the incoming indicator.' });
  }

  if (webhook.routes.size && !webhook.routes.has(strategy.id)) {
    addLog('warning', `[WEBHOOK] Strategy ${strategy.id} is not currently targeted for delivery.`);
    addAdminSignal(strategy.id, {
      id: randomId('sig'),
      timestamp: nowIso(),
      action: 'ignored',
      side: 'blocked',
      symbol: resolvedSymbol,
      indicator: resolvedIndicator,
      strategyId: strategy.id,
      status: 'blocked by admin routing',
    });
    return res.json({ ok: true, delivered: 0, message: 'Strategy not targeted.' });
  }

  const parsed = parseDirection(resolvedDirection);
  const signal = {
    id: randomId('sig'),
    timestamp: nowIso(),
    indicator: resolvedIndicator,
    symbol: resolvedSymbol,
    action: parsed.action,
    side: parsed.side,
    strategyId: strategy.id,
  };

  const delivered = deliverSignalToUsers(strategy, signal);

  const adminRecord = {
    id: signal.id,
    timestamp: signal.timestamp,
    action: signal.action,
    side: signal.side,
    symbol: signal.symbol,
    strategyId: strategy.id,
    indicator: resolvedIndicator,
    status:
      delivered > 0
        ? `delivered to ${delivered} user${delivered === 1 ? '' : 's'}`
        : 'no approved recipients',
  };
  addAdminSignal(strategy.id, adminRecord);
  addLog(
    'info',
    `[WEBHOOK] ${strategy.name} → ${resolvedSymbol} (${signal.side.toUpperCase()}) delivered to ${delivered} user(s)`,
  );

  res.json({ ok: true, delivered });
});

app.use(express.static(path.join(__dirname, 'dist')));

app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'dist', 'index.html'));
});

const server = app.listen(PORT, '0.0.0.0', () => {
  addLog('info', `Server successfully started on http://0.0.0.0:${PORT}`);
  console.log(`Server successfully started on http://0.0.0.0:${PORT}`);
});

process.on('SIGTERM', () => {
  console.log('SIGTERM signal received: closing HTTP server');
  server.close(() => {
    console.log('HTTP server closed');
  });
});
