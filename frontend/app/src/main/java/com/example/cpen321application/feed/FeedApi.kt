package com.example.cpen321application.feed

import com.example.cpen321application.auth.SessionManager
import java.io.IOException
import org.json.JSONObject

// One listing as the feed shows it.
data class FeedListing(
    val id: String,
    val category: String,
    val price: Double,
    val condition: String,
    val description: String,
    // The first photo, shown on the card; null if the listing has none.
    val photoId: String?
)

// One page of the feed. nextCursor is null on the last page.
data class FeedPage(val listings: List<FeedListing>, val nextCursor: String?)

// Where the feed gets its pages, so tests can supply their own.
fun interface FeedSource {
    // The page that follows `before` (a listing id), or the newest page when null.
    suspend fun page(before: String?): FeedPage
}

// GET /api/feed/listings: open listings from other users, newest first.
class FeedApi(private val sessions: SessionManager) : FeedSource {
    override suspend fun page(before: String?): FeedPage {
        val cursor = if (before == null) "" else "&before=$before"
        val result = sessions.authorizedRequest("GET", "/api/feed/listings?limit=$PAGE_SIZE$cursor")
        if (!result.isSuccess) {
            throw IOException("HTTP ${result.code}: ${result.errorMessage}")
        }
        return parseFeedPage(result.body)
    }

    companion object {
        const val PAGE_SIZE = 20
    }
}

// Reads a `{ listings, nextCursor }` response. Throws JSONException if it is not one.
fun parseFeedPage(body: String): FeedPage {
    val json = JSONObject(body)
    val items = json.getJSONArray("listings")
    val listings = (0 until items.length()).map { index ->
        val item = items.getJSONObject(index)
        FeedListing(
            id = item.getString("id"),
            category = item.getString("category"),
            price = item.getDouble("price"),
            condition = item.getString("condition"),
            description = item.optString("description"),
            photoId = item.optJSONArray("photoIds")?.optString(0)?.takeIf { it.isNotEmpty() }
        )
    }
    val nextCursor = if (json.isNull("nextCursor")) null else json.getString("nextCursor")
    return FeedPage(listings, nextCursor)
}
