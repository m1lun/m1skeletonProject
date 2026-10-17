package com.example.cpen321application.auth

import java.io.IOException
import java.net.HttpURLConnection
import java.net.URL
import org.json.JSONObject

private const val HTTP_TIMEOUT_MS = 5_000
private const val MAX_ERROR_CHARS = 200

// A finished HTTP exchange with the backend.
data class HttpResult(val code: Int, val body: String) {
    val isSuccess: Boolean
        get() = code in HttpURLConnection.HTTP_OK until HttpURLConnection.HTTP_MULT_CHOICE

    // The backend's `{ error }` message for a failed request, or the raw body.
    val errorMessage: String
        get() = runCatching { JSONObject(body).getString("error") }
            .getOrDefault(body.take(MAX_ERROR_CHARS))
            .ifBlank { "HTTP $code" }
}

// Plain JSON requests to the backend. Blocks, so call it from Dispatchers.IO.
// Throws IOException only when the backend cannot be reached at all; HTTP
// error statuses come back as an HttpResult.
interface BackendClient {
    fun send(method: String, path: String, body: JSONObject? = null, bearerToken: String? = null): HttpResult
}

class BackendHttp(private val apiBaseUrl: String) : BackendClient {
    override fun send(method: String, path: String, body: JSONObject?, bearerToken: String?): HttpResult {
        val conn = (URL(apiBaseUrl.trimEnd('/') + path).openConnection() as HttpURLConnection).apply {
            requestMethod = method
            connectTimeout = HTTP_TIMEOUT_MS
            readTimeout = HTTP_TIMEOUT_MS
            setRequestProperty("Accept", "application/json")
            if (bearerToken != null) {
                setRequestProperty("Authorization", "Bearer $bearerToken")
            }
        }
        try {
            if (body != null) {
                conn.doOutput = true
                conn.setRequestProperty("Content-Type", "application/json")
                conn.outputStream.use { it.write(body.toString().toByteArray()) }
            }
            val code = conn.responseCode
            val stream = if (code < HttpURLConnection.HTTP_BAD_REQUEST) conn.inputStream else conn.errorStream
            return HttpResult(code, stream?.bufferedReader()?.use { it.readText() }.orEmpty())
        } finally {
            conn.disconnect()
        }
    }
}

// The backend refused the refresh token, or there is no session: the user has
// to sign in with Google again.
class SessionExpiredException(message: String) : IOException(message)
