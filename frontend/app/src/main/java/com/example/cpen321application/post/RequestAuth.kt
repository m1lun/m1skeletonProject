package com.example.cpen321application.post

import com.example.cpen321application.auth.SessionManager

interface RequestAuth {
    /** Headers to attach to every backend call. */
    suspend fun headers(): Map<String, String>
}

/** Sends the signed-in user's session token, renewing it first if it has run out. */
class SessionRequestAuth(private val sessions: SessionManager) : RequestAuth {
    override suspend fun headers(): Map<String, String> =
        mapOf("Authorization" to "Bearer ${sessions.sessionToken()}")
}
