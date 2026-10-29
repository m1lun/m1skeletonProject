package com.example.cpen321application.deals

import android.os.SystemClock
import android.util.Log
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue
import com.example.cpen321application.auth.SessionExpiredException
import java.io.IOException
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

// Main thread only: the isLoading check stops two page loads at once, and `generation`
// drops a response that arrives after a refresh or stop.
class DealsModel(private val api: DealsApi) {
    var state by mutableStateOf(DealsUiState())
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
