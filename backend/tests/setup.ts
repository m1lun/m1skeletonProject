// src/config/env.ts refuses to load without a client ID. The tests never reach
// Google, so any well-formed value will do.
process.env.GOOGLE_CLIENT_ID ??= 'test-client-id.apps.googleusercontent.com';
