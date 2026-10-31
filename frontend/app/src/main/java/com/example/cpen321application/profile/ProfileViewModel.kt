package com.example.cpen321application.profile

import android.app.Application
import android.util.Log
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue
import androidx.lifecycle.AndroidViewModel
import androidx.lifecycle.viewModelScope
import com.example.cpen321application.auth.SessionExpiredException
import com.example.cpen321application.auth.SessionManager
import com.example.cpen321application.post.Mode
import java.io.IOException
import kotlinx.coroutines.Job
import kotlinx.coroutines.async
import kotlinx.coroutines.coroutineScope
import kotlinx.coroutines.launch
import org.json.JSONException

private const val TAG = "ProfileViewModel"

data class ProfileUiState(
    val profile: Profile? = null,
    val listingCount: Int = 0,
    val requestCount: Int = 0,
    val isLoading: Boolean = false,
    val loadFailed: Boolean = false,
    val signedOut: Boolean = false
)

// Keeps the profile loaded while the user switches tabs or rotates the screen.
class ProfileViewModel(app: Application) : AndroidViewModel(app) {
    private val api = ProfileApi(SessionManager.get(app))
    private var job: Job? = null

    var state by mutableStateOf(ProfileUiState())
        private set

    // The profile already shown stays on screen while it reloads, and stays if the reload fails.
    fun refresh() {
        if (job?.isActive == true) return
        state = state.copy(isLoading = true, loadFailed = false)
        job = viewModelScope.launch {
            state = try {
                // The three requests run in parallel; if any fails, the others are cancelled and it lands below.
                coroutineScope {
                    val profile = async { api.me() }
                    val listings = async { api.countPosts(Mode.SELLING) }
                    val requests = async { api.countPosts(Mode.BUYING) }
                    ProfileUiState(profile.await(), listings.await(), requests.await())
                }
            } catch (_: SessionExpiredException) {
                state.copy(isLoading = false, signedOut = true)
            } catch (e: IOException) {
                Log.w(TAG, "Could not load the profile", e)
                state.copy(isLoading = false, loadFailed = true)
            } catch (e: JSONException) {
                Log.w(TAG, "Unexpected profile response", e)
                state.copy(isLoading = false, loadFailed = true)
            }
        }
    }
}
