// src/config/env.ts refuses to load without these. The tests never reach
// Google or MongoDB, so any well-formed values will do.
process.env.GOOGLE_CLIENT_ID ??= 'test-client-id.apps.googleusercontent.com';
process.env.MONGODB_URI ??= 'mongodb://localhost:27017/test';
process.env.JWT_SECRET ??= 'test-jwt-secret-that-is-at-least-32-characters';
