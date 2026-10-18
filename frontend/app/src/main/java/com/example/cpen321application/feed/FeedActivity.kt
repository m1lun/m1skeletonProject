package com.example.cpen321application.feed

import android.content.Intent
import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.activity.enableEdgeToEdge
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.statusBarsPadding
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.unit.dp
import com.example.cpen321application.LoginActivity
import com.example.cpen321application.R
import com.example.cpen321application.auth.SessionManager
import com.example.cpen321application.ui.theme.CPEN321ApplicationTheme
import kotlinx.coroutines.launch

// The feed of other users' listings, opened from the signed-in screen.
class FeedActivity : ComponentActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        enableEdgeToEdge()
        setContent {
            CPEN321ApplicationTheme {
                FeedPage(
                    sessions = SessionManager.get(this),
                    onBack = ::finish,
                    onSignedOut = ::openSignIn
                )
            }
        }
    }

    // The session ran out: back to sign-in, with nothing left behind it.
    private fun openSignIn() {
        startActivity(
            Intent(this, LoginActivity::class.java)
                .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TASK)
        )
        finish()
    }
}

@Composable
private fun FeedPage(sessions: SessionManager, onBack: () -> Unit, onSignedOut: () -> Unit) {
    val feed = remember { FeedModel(FeedApi(sessions)) }
    val state = feed.state
    val scope = rememberCoroutineScope()

    LaunchedEffect(Unit) {
        feed.loadMore()
    }
    LaunchedEffect(state.signedOut) {
        if (state.signedOut) onSignedOut()
    }

    Scaffold(
        modifier = Modifier.fillMaxSize(),
        topBar = { FeedTopBar(onBack = onBack) }
    ) { innerPadding ->
        FeedScreen(
            state = state,
            onLoadMore = { scope.launch { feed.loadMore() } },
            onRefresh = { scope.launch { feed.refresh() } },
            modifier = Modifier.padding(innerPadding)
        )
    }
}

@Composable
private fun FeedTopBar(onBack: () -> Unit) {
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .statusBarsPadding()
            .padding(start = 8.dp, end = 16.dp, top = 8.dp, bottom = 8.dp),
        verticalAlignment = Alignment.CenterVertically
    ) {
        TextButton(onClick = onBack, modifier = Modifier.testTag(FeedTags.BACK)) {
            Text(text = stringResource(R.string.btn_back))
        }
        Text(text = stringResource(R.string.feed_title), style = MaterialTheme.typography.headlineSmall)
    }
}
