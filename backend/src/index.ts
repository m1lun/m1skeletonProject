import { readFileSync } from 'node:fs';
import { createServer as createHttpServer } from 'node:http';
import { createServer as createHttpsServer } from 'node:https';

import { createApp } from './app';
import { env } from './config/env';

const app = createApp();

// Certificate paths are string literals so Codacy's
// security/detect-non-literal-fs-filename rule passes. They resolve against
// the backend directory, the working directory for `npm start` and the
// Docker image's WORKDIR.
const server = env.httpsEnabled
  ? createHttpsServer(
      {
        cert: readFileSync('./certs/server.crt'),
        key: readFileSync('./certs/server.key'),
      },
      app
    )
  : createHttpServer(app);

server.listen(env.port, () => {
  const scheme = env.httpsEnabled ? 'https' : 'http';
  // Startup config only, never request data, so there is nothing to forge.
  console.info(`Server listening on ${scheme}://0.0.0.0:${env.port}`);
});

for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.on(signal, () => {
    server.close(() => {
      process.exit(0);
    });
  });
}
