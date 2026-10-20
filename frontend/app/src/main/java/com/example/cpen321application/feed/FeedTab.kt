package com.example.cpen321application.feed

import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.padding
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.ui.Modifier
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import com.example.cpen321application.R

@Composable
fun FeedTab(viewModel: FeedViewModel, onSignedOut: () -> Unit, innerPadding: PaddingValues) {
    val state = viewModel.state
    LaunchedEffect(state.signedOut) {
        if (state.signedOut) onSignedOut()
    }

    Column(modifier = Modifier.fillMaxSize().padding(innerPadding)) {
        Text(
            text = stringResource(R.string.feed_title),
            style = MaterialTheme.typography.headlineMedium,
            fontWeight = FontWeight.SemiBold,
            modifier = Modifier.padding(start = 16.dp, top = 16.dp, end = 16.dp),
        )
        FeedScreen(
            state = state,
            onLoadMore = viewModel::loadMore,
            onRefresh = viewModel::refresh,
            modifier = Modifier.weight(1f),
        )
    }
}
