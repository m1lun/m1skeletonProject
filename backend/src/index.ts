import { WebSocketServer, WebSocket } from 'ws';
import { createApp } from './app';
import { env } from './config/env';

const app = createApp();

const server = app.listen(env.port, () => {
  console.log(`Server listening on port ${env.port}`);
});

const wss = new WebSocketServer({ server, path: '/pixels' });

wss.on('connection', (clientSocket) => {
  const upstream = new WebSocket('wss://8.229.22.124', {
    rejectUnauthorized: false
  });

  upstream.on('message', (data, isBinary) => {
    if (clientSocket.readyState === WebSocket.OPEN) {
      clientSocket.send(data, { binary: isBinary });
    }
  });

  upstream.on('error', () => {
    clientSocket.close();
  });

  clientSocket.on('close', () => {
    upstream.close();
  });

  clientSocket.on('error', () => {
    upstream.close();
  });
});

for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.on(signal, () => {
    wss.close();
    server.close(() => {
      process.exit(0);
    });
  });
}
