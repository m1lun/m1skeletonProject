package com.example.cpen321application.deals

import android.os.SystemClock
import android.util.Log
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue
import com.example.cpen321application.auth.SessionExpiredException
import java.io.IOException
import java.net.HttpURLConnection
import org.json.JSONException

private const val TAG = "DealsModel"
private const val STALE_AFTER_MS = 60_000L

data class DealsUiState(
    val deals: List<Deal> = emptyList(),
    val nextCursor: String? = null,
    val endReached: Boolean = false,
    val isLoading: Boolean = false,
    val isRefreshing: Boolean = false,
    val loadFailed: Boolean = false,
    val signedOut: Boolean = false
)

sealed interface RateFailure {
    data object AlreadyRated : RateFailure
    data object Unreachable : RateFailure
    data class Rejected(val message: String) : RateFailure
}

// The dialog: `dealId` is the deal being rated, null while it is closed. `previous` is the
// rating being edited, null when the deal has not been rated yet.
data class RatingUiState(
    val dealId: String? = null,
    val previous: DealRating? = null,
    val isSubmitting: Boolean = false,
    val failure: RateFailure? = null
)

// Main thread only: the isLoading check stops two page loads at once, and `generation`
// drops a response that arrives after a refresh or stop.
class DealsModel(private val api: DealsApi) {
    var state by mutableStateOf(DealsUiState())
        private set
    var rating by mutableStateOf(RatingUiState())
        private set
    private var generation = 0
    private var loadedAt = 0L

    suspend fun loadMore() {
        val current = state
        if (current.isLoading || current.endReached) return
        load(current, current.nextCursor)
    }

    // Fetches page 1 and replaces the list. The old deals stay on screen meanwhile, and stay if it fails.
    suspend fun refresh() {
        generation++
        load(state.copy(isLoading = false, isRefreshing = false), cursor = null)
    }

    fun stop() {
        generation++
        state = state.copy(isLoading = false, isRefreshing = false)
    }

    fun startRating(dealId: String) {
        rating = RatingUiState(dealId, previous = state.deals.firstOrNull { it.id == dealId }?.myRating)
    }

    fun dismissRating() {
        if (!rating.isSubmitting) rating = RatingUiState()
    }

    // Rates the deal, or edits the rating when there is one. On success the deal is updated in place, so the list is not reloaded.
    suspend fun submitRating(stars: Int, comment: String) {
        val current = rating
        val dealId = current.dealId ?: return
        if (current.isSubmitting) return
        rating = current.copy(isSubmitting = true, failure = null)
        rating = try {
            val result = if (current.previous == null) api.rate(dealId, stars, comment) else api.editRating(dealId, stars, comment)
            applyRating(dealId, result)
            RatingUiState()
        } catch (_: SessionExpiredException) {
            state = state.copy(signedOut = true)
            RatingUiState()
        } catch (e: RateRejectedException) {
            val failure = if (e.code == HttpURLConnection.HTTP_CONFLICT) RateFailure.AlreadyRated else RateFailure.Rejected(e.message.orEmpty())
            current.copy(failure = failure)
        } catch (e: IOException) {
            Log.w(TAG, "Could not submit rating", e)
            current.copy(failure = RateFailure.Unreachable)
        } catch (e: JSONException) {
            Log.w(TAG, "Unexpected rating response", e)
            current.copy(failure = RateFailure.Unreachable)
        }
    }

    // The other user's new score also goes on their other deals on screen.
    private fun applyRating(dealId: String, result: RatingResult) {
        state = state.copy(deals = state.deals.map { deal ->
            val other = if (deal.otherUser.id == result.otherUser.id) result.otherUser else deal.otherUser
            if (deal.id == dealId) deal.copy(myRating = result.rating, otherUser = other) else deal.copy(otherUser = other)
        })
    }

    fun isStale(): Boolean = loadedAt != 0L && SystemClock.elapsedRealtime() - loadedAt > STALE_AFTER_MS

    private suspend fun load(base: DealsUiState, cursor: String?) {
        val started = generation
        state = base.copy(isLoading = true, isRefreshing = cursor == null, loadFailed = false)
        val next = try {
            val page = api.page(cursor)
            DealsUiState(
                deals = if (cursor == null) page.deals else base.deals + page.deals,
                nextCursor = page.nextCursor,
                endReached = page.nextCursor == null
            )
        } catch (_: SessionExpiredException) {
            base.copy(signedOut = true)
        } catch (e: IOException) {
            Log.w(TAG, "Could not load deals", e)
            base.copy(loadFailed = true)
        } catch (e: JSONException) {
            Log.w(TAG, "Unexpected deals response", e)
            base.copy(loadFailed = true)
        }
        if (started == generation) {
            state = next
            if (!next.loadFailed && !next.signedOut) loadedAt = SystemClock.elapsedRealtime()
        }
    }
}
