package com.example.cpen321application.deals

const val MAX_STARS = 5
const val MAX_COMMENT_LENGTH = 300

enum class DealRole { SELLER, BUYER }

data class DealPost(val id: String, val category: String, val price: Double?, val photoId: String?)

data class DealRating(val stars: Int, val comment: String)

data class OtherUser(val id: String, val score: Double?, val ratingCount: Int)

data class Deal(
    val id: String,
    val role: DealRole,
    val agreedPrice: Double,
    val createdAt: String,
    val title: String,
    val listing: DealPost?,
    val request: DealPost?,
    val otherUser: OtherUser,
    val myRating: DealRating?,
    val theirRating: DealRating?
)

data class DealsPage(val deals: List<Deal>, val nextCursor: String?)

data class RatingResult(val rating: DealRating, val otherUser: OtherUser)

// A rating the backend turned down, e.g. 409 when the deal was already rated.
class RateRejectedException(val code: Int, message: String) : Exception(message)
