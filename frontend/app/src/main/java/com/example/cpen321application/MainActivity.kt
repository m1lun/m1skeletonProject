package com.example.cpen321application

import android.content.Intent
import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.BackHandler
import androidx.activity.compose.setContent
import androidx.activity.enableEdgeToEdge
import androidx.activity.viewModels
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.List
import androidx.compose.material.icons.filled.Home
import androidx.compose.material.icons.filled.Person
import androidx.compose.material3.Icon
import androidx.compose.material3.NavigationBar
import androidx.compose.material3.NavigationBarItem
import androidx.compose.material3.Scaffold
import androidx.compose.material3.SnackbarHost
import androidx.compose.material3.SnackbarHostState
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.remember
import androidx.compose.ui.Modifier
import androidx.lifecycle.lifecycleScope
import kotlinx.coroutines.launch
import androidx.compose.ui.graphics.vector.ImageVector
import com.example.cpen321application.auth.SessionManager
import com.example.cpen321application.feed.FeedTab
import com.example.cpen321application.feed.FeedViewModel
import com.example.cpen321application.feed.ownPostOf
import com.example.cpen321application.post.AppTab
import com.example.cpen321application.post.PostDetailScreen
import com.example.cpen321application.post.PostEditorScreen
import com.example.cpen321application.post.PostScreen
import com.example.cpen321application.post.PostViewModel
import com.example.cpen321application.ui.theme.CPEN321ApplicationTheme

/**
 * Hosts the app's bottom menu once the user is signed in. "My Posts" is a
 * Buying / Selling toggle over the user's own requests and listings.
 */
class MainActivity : ComponentActivity() {
    private val viewModel: PostViewModel by viewModels()
    private val feedViewModel: FeedViewModel by viewModels()

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        val sessions = SessionManager.get(this)
        if (sessions.session == null) {
            startActivity(Intent(this, LoginActivity::class.java))
            finish()
            return
        }
        enableEdgeToEdge()
        setContent {
            CPEN321ApplicationTheme {
                val snackbar = remember { SnackbarHostState() }
                LaunchedEffect(viewModel.message) {
                    viewModel.message?.let {
                        snackbar.showSnackbar(it)
                        viewModel.message = null
                    }
                }
                BackHandler(enabled = viewModel.editing || viewModel.selected != null) {
                    if (viewModel.editing) viewModel.stopEditing() else viewModel.selected = null
                }
                LaunchedEffect(viewModel.recommendationsFor) {
                    viewModel.recommendationsFor?.let {
                        feedViewModel.recommendFor(ownPostOf(it.raw), viewModel.mode)
                        viewModel.recommendationsFor = null
                    }
                }
                val fullScreen = viewModel.editing || viewModel.selected != null
                Scaffold(
                    modifier = Modifier.fillMaxSize(),
                    snackbarHost = { SnackbarHost(snackbar) },
                    bottomBar = { if (!fullScreen) AppNavigationBar(viewModel) },
                ) { innerPadding -> Content(innerPadding) }
            }
        }
    }

    private fun signOut() {
        lifecycleScope.launch {
            SessionManager.get(this@MainActivity).signOut()
            startActivity(
                Intent(this@MainActivity, LoginActivity::class.java)
                    .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TASK)
            )
            finish()
        }
    }

    @Composable
    private fun Content(innerPadding: PaddingValues) {
        val selected = viewModel.selected
        when {
            viewModel.editing -> PostEditorScreen(viewModel, innerPadding)
            selected != null -> PostDetailScreen(selected, viewModel.mode, viewModel, innerPadding)
            viewModel.tab == AppTab.FEED -> FeedTab(feedViewModel, ::signOut, innerPadding)
            viewModel.tab == AppTab.POSTS -> PostScreen(viewModel, innerPadding)
            else -> ProfileScreen(SessionManager.get(this), ::signOut, innerPadding)
        }
    }
}

@Composable
private fun AppNavigationBar(viewModel: PostViewModel) {
    NavigationBar {
        AppTab.entries.forEach { tab ->
            NavigationBarItem(
                selected = viewModel.tab == tab,
                onClick = { viewModel.tab = tab },
                icon = { Icon(tab.icon(), contentDescription = tab.label) },
                label = { Text(tab.label) },
            )
        }
    }
}

private fun AppTab.icon(): ImageVector = when (this) {
    AppTab.FEED -> Icons.Filled.Home
    AppTab.POSTS -> Icons.AutoMirrored.Filled.List
    AppTab.PROFILE -> Icons.Filled.Person
}
