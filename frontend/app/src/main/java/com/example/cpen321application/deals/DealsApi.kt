package com.example.cpen321application.deals

import com.example.cpen321application.auth.SessionManager
import com.example.cpen321application.post.objects
import java.io.IOException
import java.net.URLEncoder
import java.time.Instant
import java.time.ZoneId
import org.json.JSONObject

class DealsApi(private val sessions: SessionManager) {
    suspend fun page(cursor: String?): DealsPage {
        val params = listOfNotNull("limit=$PAGE_SIZE", cursor?.let { "before=${URLEncoder.encode(it, "UTF-8")}" })
        val result = sessions.authorizedRequest("GET", "/api/deals?${params.joinToString("&")}")
        if (!result.isSuccess) {
            throw IOException("HTTP ${result.code}: ${result.errorMessage}")
        }
        return parsePage(result.body)
    }

    companion object {
        const val PAGE_SIZE = 20
    }
}

private fun parsePage(body: String): DealsPage {
    val json = JSONObject(body)
    val nextCursor = if (json.isNull("nextCursor")) null else json.getString("nextCursor")
    return DealsPage(json.getJSONArray("deals").objects().map(::parseDeal), nextCursor)
}

private fun parseDeal(deal: JSONObject): Deal = Deal(
    id = deal.getString("id"),
    role = if (deal.getString("role") == "seller") DealRole.SELLER else DealRole.BUYER,
    agreedPrice = deal.getDouble("agreedPrice"),
    createdAt = localDate(deal.getString("createdAt")),
    title = deal.getString("title"),
    listing = deal.optObject("listing")?.let(::parsePost),
    request = deal.optObject("request")?.let(::parsePost),
    otherUser = parseOtherUser(deal.getJSONObject("otherUser")),
    myRating = deal.optObject("myRating")?.let(::parseRating),
    theirRating = deal.optObject("theirRating")?.let(::parseRating)
)

private fun parsePost(post: JSONObject): DealPost = DealPost(
    id = post.getString("id"),
    category = post.getString("category"),
    price = post.optDouble("price").takeUnless { it.isNaN() },
    photoId = if (post.isNull("photoId")) null else post.getString("photoId")
)

private fun parseOtherUser(user: JSONObject): OtherUser = OtherUser(
    id = user.getString("id"),
    score = if (user.isNull("score")) null else user.getDouble("score"),
    ratingCount = user.getInt("ratingCount")
)

private fun parseRating(rating: JSONObject): DealRating =
    DealRating(stars = rating.getInt("stars"), comment = rating.optString("comment"))

// The day an ISO timestamp falls on in the user's time zone, e.g. "2026-10-24".
private fun localDate(iso: String): String = Instant.parse(iso).atZone(ZoneId.systemDefault()).toLocalDate().toString()

private fun JSONObject.optObject(key: String): JSONObject? = if (isNull(key)) null else getJSONObject(key)
