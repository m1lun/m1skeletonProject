package com.example.cpen321application.feed

import android.app.Application
import androidx.lifecycle.AndroidViewModel
import androidx.lifecycle.viewModelScope
import com.example.cpen321application.auth.SessionManager
import kotlinx.coroutines.launch

// Keeps the feed loaded while the user switches tabs or rotates the screen.
class FeedViewModel(app: Application) : AndroidViewModel(app) {
    private val feed = FeedModel(FeedApi(SessionManager.get(app)))
    val state: FeedUiState
        get() = feed.state

    init {
        loadMore()
    }

    fun loadMore() {
        viewModelScope.launch { feed.loadMore() }
    }

    fun refresh() {
        viewModelScope.launch { feed.refresh() }
    }
}
