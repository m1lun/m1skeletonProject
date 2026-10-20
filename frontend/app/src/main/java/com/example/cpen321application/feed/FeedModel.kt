package com.example.cpen321application.feed

import android.util.Log
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue
import com.example.cpen321application.auth.SessionExpiredException
import java.io.IOException
import org.json.JSONException

private const val TAG = "FeedModel"

data class FeedUiState(
    val listings: List<FeedListing> = emptyList(),
    val nextCursor: String? = null,
    val endReached: Boolean = false,
    val isLoading: Boolean = false,
    val loadFailed: Boolean = false,
    val signedOut: Boolean = false
)

// Main thread only: the isLoading check is what stops two loads running at once.
class FeedModel(private val api: FeedApi) {
    var state by mutableStateOf(FeedUiState())
        private set

    suspend fun loadMore() {
        val current = state
        if (current.isLoading || current.endReached) return
        state = current.copy(isLoading = true, loadFailed = false)
        state = try {
            val page = api.page(current.nextCursor)
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

    suspend fun refresh() {
        state = FeedUiState()
        loadMore()
    }
}
