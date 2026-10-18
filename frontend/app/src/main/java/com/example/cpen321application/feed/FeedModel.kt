package com.example.cpen321application.feed

import android.util.Log
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue
import com.example.cpen321application.auth.SessionExpiredException
import java.io.IOException
import org.json.JSONException

private const val TAG = "FeedModel"

// What the feed screen shows.
data class FeedUiState(
    val listings: List<FeedListing> = emptyList(),
    val nextCursor: String? = null,
    // The last page has been loaded.
    val endReached: Boolean = false,
    val isLoading: Boolean = false,
    // The last load failed; the screen offers Retry.
    val loadFailed: Boolean = false,
    // The session ran out and the user has to sign in again.
    val signedOut: Boolean = false
)

// Loads the feed one page at a time and keeps every page loaded so far.
// Call it from the main thread: a load in progress blocks a second one.
class FeedModel(private val source: FeedSource) {
    var state by mutableStateOf(FeedUiState())
        private set

    // Loads the next page, unless a page is already loading or the last one was reached.
    suspend fun loadMore() {
        val current = state
        if (current.isLoading || current.endReached) return
        state = current.copy(isLoading = true, loadFailed = false)
        state = try {
            val page = source.page(current.nextCursor)
            state.copy(
                listings = state.listings + page.listings,
                nextCursor = page.nextCursor,
                endReached = page.nextCursor == null,
                isLoading = false
            )
        } catch (_: SessionExpiredException) {
            state.copy(isLoading = false, signedOut = true)
        } catch (e: IOException) {
            Log.w(TAG, "Could not load the feed", e)
            state.copy(isLoading = false, loadFailed = true)
        } catch (e: JSONException) {
            Log.w(TAG, "Unexpected feed response", e)
            state.copy(isLoading = false, loadFailed = true)
        }
    }

    // Starts again from the newest listings.
    suspend fun refresh() {
        state = FeedUiState()
        loadMore()
    }
}
