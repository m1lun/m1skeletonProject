# CPEN321_26W1_ProjectName

_Keep this README up to date with the steps required to build and run the frontend and backend (including any scripts, config files, and environment variables). TAs ill follow these instructions._

## Requirements

Install the following before the frontend or backend setup steps:

- [git](https://git-scm.com/install/)


--- 

## Frontend Setup

### Requirements

- [Android Studio](https://developer.android.com/studio) (latest version)
- [Java 17](https://adoptium.net/temurin/releases/?version=17)
- [Android SDK](https://developer.android.com/studio#command-tools) with API level 36+ (Android 16)

### Setup

1. **Open project**: Open the `frontend/` directory in Android Studio
2. **Sync Gradle**: Android Studio will automatically prompt you to sync the project. Click "Sync Now". You can also manually run `cd frontend && ./gradlew build` to trigger the sync and download the necessary dependencies.
3. **Configure Android SDK**: Ensure you have Android SDK 36 installed.
4. **Set up emulator/device**:
   - Create a new AVD (Android Virtual Device) by selecting Pixel 9 as the device and Android Baklava (API level 36) as the system image.
   - Alternatively, connect a physical Android device running Android 16 (API level 36).
5. **Setup app config**: Copy the example file, then fill in local values:
   ```bash
   cp frontend/local.properties.example frontend/local.properties
   ```
   Set at least:
   - `sdk.dir`: path to your Android SDK. Android Studio usually writes this the first time you open `frontend/`. On Mac it is often `sdk.dir=/Users/<username>/Library/Android/sdk`.
   - `API_BASE_URL`: backend URL baked into the APK. The example file points at the deployed backend, `https\://34.168.1.92\:3000` (colons are escaped in properties files). To run against a backend on your own machine, use `http://10.0.2.2:3000` for the emulator (`10.0.2.2` is the host machine). For a physical device on the same Wi-Fi, use `http://<your-lan-ip>:3000` and add that IP as a `<domain>` in the local-development block of `frontend/app/src/main/res/xml/network_security_config.xml` (plain HTTP is blocked for every other host).
   - `GOOGLE_CLIENT_ID`: the **Web** OAuth client ID from Google Cloud Console. Must be the same value as `GOOGLE_CLIENT_ID` in `backend/.env`.
6. **Google sign-in**: the SHA-1 of the key that signs the APK must be registered on an **Android** OAuth client (package `com.example.matchmarket`) in the same Google Cloud project as the Web client. Both debug and release builds are signed with `~/.android/debug.keystore` by default; print its SHA-1 with:
   ```bash
   keytool -list -v -keystore ~/.android/debug.keystore -alias androiddebugkey -storepass android | grep SHA1
   ```
   The emulator also needs a Google account (Settings → Passwords & accounts); the app offers to open that screen if there is none.


### Build and Run

- **Debug build**: Click the green play button in the toolbar, to compile the code, package a debug APK, and install it on the connected device or running emulator. Alternatively, from the project root, run `./scripts/run-frontend.sh`.
- **Release build**: Go to Build -> Generate Signed App Bundle or APK -> APK. Follow the on-screen instructions to create a key, and select the "release" build variant. You will then have to manually install the generated APK on your device or the running emulator.


### Backend Configuration

Ensure the backend server is running and update the base URL in the app configuration if needed.

---
## Backend Setup

You can run the backend in one of two ways:
* Locally via Node.js 
* Via Docker Compose

Both ways use the same `backend/.env` file (see below).

### Environment configuration

From the project root:

```bash
cp backend/.env.example backend/.env
```

Set at least:
- `GOOGLE_CLIENT_ID` (required): the **Web** OAuth client ID. The backend verifies every Google ID token against it and will not start without it. Must match `GOOGLE_CLIENT_ID` in `frontend/local.properties`.
- `JWT_SECRET` (required): signs the backend's session tokens; at least 32 characters, and the server will not start without it. Generate one per server with `openssl rand -base64 48` and never commit it: anyone holding it can sign in as any user.
- `MONGODB_URI` (required): where sessions (and listings) are stored. The default in `.env.example` assumes MongoDB on `localhost:27017`; Docker Compose overrides it with its own `mongo` service. The server waits for MongoDB before it starts listening.
- `PORT` (optional): defaults to `3000` if unset.
- `ENABLE_HTTPS` (optional): `true` serves HTTPS using `backend/certs/server.crt` and `backend/certs/server.key` (see [HTTPS](#https)). Leave unset for local HTTP.

### API

Google is asked only once, at sign-in. The backend then issues its own tokens (`backend/src/sessions.ts`):

- **Session token**: a JWT signed with `JWT_SECRET`, valid for 15 minutes. Sent as `Authorization: Bearer <session token>` on every data request.
- **Refresh token**: 256 random bits, valid for 30 days. Only its SHA-256 hash is stored, in the `sessions` collection; MongoDB deletes it once expired. Each refresh replaces it with a new one, and presenting an already-used refresh token revokes every token from that sign-in (it means two parties hold it).

Data routes go behind the `requireAuth` middleware, which answers `401` without a valid session token. Read the user in a handler with `currentUser(res)`:

```ts
app.get('/api/listings/mine', requireAuth, (req, res) => {
  const { id, email } = currentUser(res); // id is the Google account id
});
```

On the app side, call `SessionManager.get(context).authorizedRequest(...)` (`frontend/.../auth/SessionManager.kt`). It attaches the session token, refreshes it when it expires or the backend answers `401`, and throws `SessionExpiredException` when the user has to sign in again.

- `POST /api/auth/google`: body `{ "idToken": "..." }`. Verifies the token with Google and starts a session: `{ "firstName", "lastName", "email", "sessionToken", "sessionExpiresIn", "refreshToken" }`. `400` with no token, `401` if it fails verification.
- `POST /api/auth/refresh`: body `{ "refreshToken": "..." }`. Same response as sign-in, with new tokens; the old refresh token stops working. Google is not called. `401` means the user has to sign in again.
- `POST /api/auth/logout`: body `{ "refreshToken": "..." }`. Revokes every token from that sign-in. `204`, even if it was already gone.
- `GET /health`: open, used by the run script and health checks.


### Option 1: Run locally

**Requirements:** 
- [Node.js](https://nodejs.org/en/download/) 22+
- [npm](https://docs.npmjs.com/downloading-and-installing-node-js-and-npm) 10+

**Setup:** 
1. Install dependencies:

   ```bash
   cd backend
   npm install
   ```

2. **Development** (TypeScript with auto-reload):

   ```bash
   npm run dev
   ```

3. **Production build** (optional):

   ```bash
   npm run build
   npm start
   ```

### Option 2: Run with Docker Compose

**Requirements:** 
- [Docker](https://docs.docker.com/desktop/setup/install) and [Docker Compose](https://docs.docker.com/desktop/setup/install) v2.24+
- [curl](https://curl.se/download.html)

**Setup**
1. **Start** (from the project root):

   ```bash
   ./scripts/run-backend.sh
   ```

   Or run Compose directly:

   ```bash
   docker compose up --build -d
   ```

2. **Stop**:

   ```bash
   docker compose down
   ```

### HTTPS

M1 requires the app to reach the backend over HTTPS. The deployed backend runs on a Google Cloud VM at `https://34.168.1.92:3000` (static IP) with `ENABLE_HTTPS=true` and a self-signed certificate in `/opt/cpen321/backend/certs/`. The app pins that certificate (`frontend/app/src/main/res/raw/server_cert.pem`, trusted for that IP only by `res/xml/network_security_config.xml`), and the deploy workflow checks `/health` against it.

`backend/certs/` is gitignored and excluded from the Docker image (Compose mounts it read-only), so the private key is never committed. Deploys run `git reset --hard`, which leaves the untracked `certs/` and `.env` in place. To generate a self-signed certificate for a server at `<PUBLIC_IP>` (for example when the certificate expires or the IP changes):

```bash
mkdir -p backend/certs
openssl req -x509 -newkey rsa:2048 -nodes \
  -keyout backend/certs/server.key -out backend/certs/server.crt \
  -days 365 -subj "/CN=<PUBLIC_IP>" \
  -addext "subjectAltName=IP:<PUBLIC_IP>"
```

The IP must be in `subjectAltName` or Android rejects the certificate. Then set `ENABLE_HTTPS=true` in `backend/.env`, and in the app:

1. Copy `backend/certs/server.crt` to `frontend/app/src/main/res/raw/server_cert.pem` (the public certificate only, never the key).
2. In `frontend/app/src/main/res/xml/network_security_config.xml`, put `<PUBLIC_IP>` in the deployed-backend `<domain>`.
3. Set `API_BASE_URL=https\://<PUBLIC_IP>\:3000` in `frontend/local.properties.example` and your own `frontend/local.properties`.

`scripts/run-backend.sh` reads `ENABLE_HTTPS` from `backend/.env` and probes `https://localhost:<PORT>/health` when it is on.

## Testing

Run these from the project root.

| What | Command |
| --- | --- |
| Backend interface tests (mock, no-mock, and combined, with coverage) | `./scripts/run-backend-interface-tests.sh` |
| Backend non-functional requirement tests | `./scripts/run-backend-nfr-tests.sh` |
| Frontend end-to-end tests (needs an emulator or device with the app signed in) | `./scripts/run-frontend-e2e-tests.sh` |
| Frontend non-functional requirement tests | `./scripts/run-frontend-nfr-tests.sh` |

Backend tests use Jest. Frontend tests use the Jetpack Compose testing APIs and UI Automator.

## Continuous integration

GitHub Actions runs on every push to `main` and on pull requests:

- `.github/workflows/backend-tests.yml` runs the typecheck and the backend test scripts.
- `.github/workflows/frontend-build.yml` builds the debug APK.

## Code review (Codacy)

Codacy is configured in its web UI, not in this repository:

1. Sign in at https://www.codacy.com with GitHub and add this repository.
2. On the "Code patterns" page, keep only detekt (Kotlin), ESLint (TypeScript), and Trivy (Kotlin and TypeScript) enabled.
3. Point Codacy at the existing `detekt.yml` and `.eslintrc.json` in the repository root, and enable all Trivy patterns. Do not edit those two files.
