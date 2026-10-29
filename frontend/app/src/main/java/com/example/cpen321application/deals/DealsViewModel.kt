package com.example.cpen321application.deals

import android.app.Application
import androidx.lifecycle.AndroidViewModel
import androidx.lifecycle.viewModelScope
import com.example.cpen321application.auth.SessionManager
import kotlinx.coroutines.Job
import kotlinx.coroutines.launch

// Keeps the deals loaded while the user switches tabs or rotates the screen.
class DealsViewModel(app: Application) : AndroidViewModel(app) {
    private val model = DealsModel(DealsApi(SessionManager.get(app)))
    private var job: Job? = null

    val state: DealsUiState
        get() = model.state

    fun refresh() {
        job?.cancel()
        job = viewModelScope.launch { model.refresh() }
    }

    fun loadMore() {
        if (job?.isActive == true) return
        job = viewModelScope.launch { model.loadMore() }
    }

    fun refreshIfStale() {
        if (model.isStale()) refresh()
    }

    // Cancels the request in flight when the user leaves the tab.
    fun stop() {
        job?.cancel()
        model.stop()
    }
}
