import express, { type Express } from 'express';
import https from 'https';
import os from 'os';

function fetchPublicIp(): Promise<string> {
  return new Promise((resolve, reject) => {
    https.get('https://api.ipify.org?format=json', (res) => {
      let raw = '';
      res.on('data', (chunk: string) => { raw += chunk; });
      res.on('end', () => {
        try {
          resolve((JSON.parse(raw) as { ip: string }).ip);
        } catch (e) {
          reject(e);
        }
      });
    }).on('error', reject);
  });
}

function getLocalIp(): string {
  for (const ifaces of Object.values(os.networkInterfaces())) {
    for (const iface of ifaces ?? []) {
      if (iface.family === 'IPv4' && !iface.internal) {
        return iface.address;
      }
    }
  }
  return '0.0.0.0';
}

function getServerTime(): string {
  const now = new Date();
  const offset = -now.getTimezoneOffset();
  const sign = offset >= 0 ? '+' : '-';
  const abs = Math.abs(offset);
  const hh = String(Math.floor(abs / 60)).padStart(2, '0');
  const mm = String(abs % 60).padStart(2, '0');
  const hours = String(now.getHours()).padStart(2, '0');
  const minutes = String(now.getMinutes()).padStart(2, '0');
  const seconds = String(now.getSeconds()).padStart(2, '0');
  return `${hours}:${minutes}:${seconds} GMT${sign}${hh}:${mm}`;
}

export function createApp(): Express {
  const app = express();

  app.get('/health', (_req, res) => {
    res.json({ status: 'ok' });
  });

  app.get('/ip', (_req, res) => {
    fetchPublicIp()
      .then((ip) => res.json({ ip }))
      .catch(() => res.json({ ip: getLocalIp() }));
  });

  app.get('/time', (_req, res) => {
    res.json({ time: getServerTime() });
  });

  app.get('/name', (_req, res) => {
    res.json({ firstName: 'Milun', lastName: 'Gracias-Taplay' });
  });

  app.use((_req, res) => {
    res.status(404).json({ error: 'Not Found' });
  });

  return app;
}
