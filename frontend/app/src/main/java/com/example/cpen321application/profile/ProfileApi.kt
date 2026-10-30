package com.example.cpen321application.profile

import com.example.cpen321application.auth.SessionManager
import java.io.IOException
import java.time.Instant
import java.time.LocalDate
import java.time.ZoneId
import org.json.JSONObject

// The signed-in user's own profile, as GET /api/users/me returns it.
data class Profile(
    val id: String,
    val firstName: String,
    val lastName: String,
    val email: String,
    val pictureUrl: String?,
    val address: String?,
    // The day the account was made, in the user's time zone.
    val memberSince: LocalDate
) {
    // Full name, or the email when the Google account has no name on it.
    val displayName: String
        get() = "$firstName $lastName".trim().ifEmpty { email }
}

class ProfileApi(private val sessions: SessionManager) {
    suspend fun me(): Profile {
        val result = sessions.authorizedRequest("GET", "/api/users/me")
        if (!result.isSuccess) {
            throw IOException("HTTP ${result.code}: ${result.errorMessage}")
        }
        return parseProfile(JSONObject(result.body))
    }
}

private fun parseProfile(user: JSONObject): Profile = Profile(
    id = user.getString("id"),
    firstName = user.getString("firstName"),
    lastName = user.getString("lastName"),
    email = user.getString("email"),
    pictureUrl = user.optText("pictureUrl"),
    // address is left out of the response when the user has not set one.
    address = user.optText("address"),
    memberSince = Instant.parse(user.getString("createdAt")).atZone(ZoneId.systemDefault()).toLocalDate()
)

private fun JSONObject.optText(key: String): String? = if (isNull(key)) null else getString(key)
