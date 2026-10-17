package com.example.cpen321application.auth

import java.io.IOException
import java.net.HttpURLConnection
import java.util.concurrent.atomic.AtomicInteger
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.async
import kotlinx.coroutines.awaitAll
import kotlinx.coroutines.runBlocking
import org.json.JSONObject
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Assert.fail
import org.junit.Test

private const val PROTECTED_PATH = "/api/things"

private fun sessionWith(token: Int, expiresAtMs: Long = Long.MAX_VALUE) = AuthSession(
    firstName = "Ada",
    lastName = "Lovelace",
    email = "ada@example.com",
    sessionToken = "session-$token",
    sessionExpiresAtMs = expiresAtMs,
    refreshToken = "refresh-$token"
)

// Session storage that lives in memory instead of SharedPreferences.
private class MemoryStorage(var stored: AuthSession?) : SessionStorage {
    override fun load(): AuthSession? = stored
    override fun save(session: AuthSession) {
        stored = session
    }
    override fun clear() {
        stored = null
    }
}

// Stands in for the backend. Only the newest session token is accepted on
// PROTECTED_PATH, and each refresh token can be traded once.
private class FakeBackend(private var latest: Int = 0) : BackendClient {
    val refreshCalls = AtomicInteger()
    var revoked = false
    var offline = false
    private var sessionExpired = false

    // The current session token stops working until the next refresh.
    fun expireSessionToken() {
        sessionExpired = true
    }

    @Synchronized
    override fun send(method: String, path: String, body: JSONObject?, bearerToken: String?): HttpResult {
        if (offline) throw IOException("Backend unreachable")
        return when (path) {
            "/api/auth/refresh" -> refresh(body?.getString("refreshToken"))
            "/api/auth/logout" -> HttpResult(HttpURLConnection.HTTP_NO_CONTENT, "")
            PROTECTED_PATH -> if (!sessionExpired && bearerToken == "session-$latest") ok("{}") else unauthorized()
            else -> HttpResult(HttpURLConnection.HTTP_NOT_FOUND, "")
        }
    }

    private fun refresh(refreshToken: String?): HttpResult {
        if (revoked || refreshToken != "refresh-$latest") return unauthorized()
        refreshCalls.incrementAndGet()
        latest += 1
        sessionExpired = false
        return ok(
            JSONObject()
                .put("firstName", "Ada")
                .put("lastName", "Lovelace")
                .put("email", "ada@example.com")
                .put("sessionToken", "session-$latest")
                .put("sessionExpiresIn", 900)
                .put("refreshToken", "refresh-$latest")
                .toString()
        )
    }

    private fun ok(body: String) = HttpResult(HttpURLConnection.HTTP_OK, body)
    private fun unauthorized() = HttpResult(HttpURLConnection.HTTP_UNAUTHORIZED, """{"error":"nope"}""")
}

class SessionManagerTest {
    @Test
    fun validSessionTokenIsSentWithoutRefreshing() = runBlocking {
        val backend = FakeBackend(latest = 0)
        val manager = SessionManager(MemoryStorage(sessionWith(0)), backend)

        val result = manager.authorizedRequest("GET", PROTECTED_PATH)

        assertEquals(HttpURLConnection.HTTP_OK, result.code)
        assertEquals(0, backend.refreshCalls.get())
    }

    @Test
    fun unauthorizedResponseRefreshesOnceAndRetries() = runBlocking {
        // The app thinks the token is still valid, but the backend says 401.
        val backend = FakeBackend(latest = 0).also { it.expireSessionToken() }
        val storage = MemoryStorage(sessionWith(0))
        val manager = SessionManager(storage, backend)

        val result = manager.authorizedRequest("GET", PROTECTED_PATH)

        assertEquals(HttpURLConnection.HTTP_OK, result.code)
        assertEquals(1, backend.refreshCalls.get())
        assertEquals("refresh-1", storage.stored?.refreshToken)
    }

    @Test
    fun expiredSessionIsRenewedBeforeTheRequest() = runBlocking {
        val backend = FakeBackend(latest = 0)
        val storage = MemoryStorage(sessionWith(0, expiresAtMs = 0L))
        val manager = SessionManager(storage, backend)

        val result = manager.authorizedRequest("GET", PROTECTED_PATH)

        assertEquals(HttpURLConnection.HTTP_OK, result.code)
        assertEquals(1, backend.refreshCalls.get())
        assertEquals("session-1", storage.stored?.sessionToken)
    }

    @Test
    fun rejectedRefreshTokenSignsTheUserOut() = runBlocking {
        val backend = FakeBackend(latest = 0).also { it.revoked = true }
        val storage = MemoryStorage(sessionWith(0, expiresAtMs = 0L))
        val manager = SessionManager(storage, backend)

        try {
            manager.authorizedRequest("GET", PROTECTED_PATH)
            fail("Expected SessionExpiredException")
        } catch (_: SessionExpiredException) {
            // Expected: the user has to sign in again.
        }

        assertNull(manager.session)
        assertNull(storage.stored)
    }

    @Test
    fun concurrentUnauthorizedRequestsTradeTheRefreshTokenOnce() = runBlocking {
        val backend = FakeBackend(latest = 0)
        val manager = SessionManager(MemoryStorage(sessionWith(0, expiresAtMs = 0L)), backend)

        val results = List(5) {
            async(Dispatchers.Default) { manager.authorizedRequest("GET", PROTECTED_PATH) }
        }.awaitAll()

        assertTrue(results.all { it.code == HttpURLConnection.HTTP_OK })
        assertEquals(1, backend.refreshCalls.get())
    }

    @Test
    fun restoreKeepsTheStoredSessionWhenOffline() = runBlocking {
        val backend = FakeBackend(latest = 0).also { it.offline = true }
        val manager = SessionManager(MemoryStorage(sessionWith(0)), backend)

        assertEquals("refresh-0", manager.restore()?.refreshToken)
        assertNotNull(manager.session)
    }

    @Test
    fun restoreReturnsNullWhenTheSessionWasRevoked() = runBlocking {
        val backend = FakeBackend(latest = 0).also { it.revoked = true }
        val storage = MemoryStorage(sessionWith(0))
        val manager = SessionManager(storage, backend)

        assertNull(manager.restore())
        assertNull(storage.stored)
    }

    @Test
    fun signOutClearsTheSessionEvenWhenOffline() = runBlocking {
        val backend = FakeBackend(latest = 0).also { it.offline = true }
        val storage = MemoryStorage(sessionWith(0))
        val manager = SessionManager(storage, backend)

        manager.signOut()

        assertNull(manager.session)
        assertNull(storage.stored)
    }
}
