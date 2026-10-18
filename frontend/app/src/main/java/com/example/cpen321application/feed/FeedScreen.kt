package com.example.cpen321application.feed

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.lazy.rememberLazyListState
import androidx.compose.material3.Card
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.derivedStateOf
import androidx.compose.runtime.getValue
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import com.example.cpen321application.R
import java.text.NumberFormat
import java.util.Locale

// Start loading the next page when the user is this many listings from the end.
private const val LOAD_AHEAD = 5
private const val DESCRIPTION_LINES = 2

// Test tags for the E2E tests.
object FeedTags {
    // On the signed-in screen: opens the feed.
    const val OPEN = "home_view_feed"
    const val BACK = "feed_back"
    const val LIST = "feed_list"
    const val LOADING = "feed_loading"
    const val LOADING_MORE = "feed_loading_more"
    const val EMPTY = "feed_empty"
    const val ERROR = "feed_error"
    const val RETRY = "feed_retry"
    const val REFRESH = "feed_refresh"
    fun listing(id: String) = "feed_listing_$id"
}

// The feed of other users' listings, with loading, empty and error states.
@Composable
fun FeedScreen(
    state: FeedUiState,
    onLoadMore: () -> Unit,
    onRefresh: () -> Unit,
    modifier: Modifier = Modifier
) {
    val nothingShown = state.listings.isEmpty()
    when {
        nothingShown && state.loadFailed -> FeedMessage(
            text = stringResource(R.string.feed_error),
            buttonText = stringResource(R.string.btn_retry),
            textTag = FeedTags.ERROR,
            buttonTag = FeedTags.RETRY,
            onClick = onLoadMore,
            modifier = modifier
        )
        nothingShown && state.endReached -> FeedMessage(
            text = stringResource(R.string.feed_empty),
            buttonText = stringResource(R.string.btn_refresh),
            textTag = FeedTags.EMPTY,
            buttonTag = FeedTags.REFRESH,
            onClick = onRefresh,
            modifier = modifier
        )
        nothingShown -> Box(modifier = modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
            CircularProgressIndicator(modifier = Modifier.testTag(FeedTags.LOADING))
        }
        else -> FeedList(state = state, onLoadMore = onLoadMore, modifier = modifier)
    }
}

@Composable
private fun FeedList(state: FeedUiState, onLoadMore: () -> Unit, modifier: Modifier = Modifier) {
    val listState = rememberLazyListState()
    val nearEnd by remember {
        derivedStateOf {
            val lastVisible = listState.layoutInfo.visibleItemsInfo.lastOrNull()?.index ?: 0
            lastVisible >= listState.layoutInfo.totalItemsCount - LOAD_AHEAD
        }
    }
    // Asks again each time more listings arrive, so a long scroll keeps loading pages.
    LaunchedEffect(nearEnd, state.listings.size) {
        if (nearEnd) onLoadMore()
    }

    LazyColumn(
        state = listState,
        contentPadding = PaddingValues(all = 16.dp),
        verticalArrangement = Arrangement.spacedBy(12.dp),
        modifier = modifier
            .fillMaxSize()
            .testTag(FeedTags.LIST)
    ) {
        items(state.listings, key = { it.id }) { listing ->
            ListingCard(listing)
        }
        item {
            FeedFooter(state = state, onRetry = onLoadMore)
        }
    }
}

@Composable
private fun FeedFooter(state: FeedUiState, onRetry: () -> Unit) {
    Box(modifier = Modifier.fillMaxWidth(), contentAlignment = Alignment.Center) {
        if (state.isLoading) {
            CircularProgressIndicator(modifier = Modifier.testTag(FeedTags.LOADING_MORE))
        } else if (state.loadFailed) {
            OutlinedButton(onClick = onRetry, modifier = Modifier.testTag(FeedTags.RETRY)) {
                Text(text = stringResource(R.string.btn_retry))
            }
        }
    }
}

@Composable
private fun ListingCard(listing: FeedListing) {
    Card(
        modifier = Modifier
            .fillMaxWidth()
            .testTag(FeedTags.listing(listing.id))
    ) {
        Column(modifier = Modifier.padding(all = 16.dp), verticalArrangement = Arrangement.spacedBy(4.dp)) {
            Text(text = formatPrice(listing.price), style = MaterialTheme.typography.titleLarge)
            Text(
                text = listing.category.replaceFirstChar { it.titlecase(Locale.getDefault()) },
                style = MaterialTheme.typography.titleMedium
            )
            Text(
                text = stringResource(R.string.feed_condition, listing.condition),
                style = MaterialTheme.typography.bodyMedium,
                color = MaterialTheme.colorScheme.onSurfaceVariant
            )
            if (listing.description.isNotBlank()) {
                Text(
                    text = listing.description,
                    style = MaterialTheme.typography.bodyMedium,
                    maxLines = DESCRIPTION_LINES,
                    overflow = TextOverflow.Ellipsis
                )
            }
        }
    }
}

@Composable
private fun FeedMessage(
    text: String,
    buttonText: String,
    textTag: String,
    buttonTag: String,
    onClick: () -> Unit,
    modifier: Modifier = Modifier
) {
    Column(
        modifier = modifier
            .fillMaxSize()
            .padding(all = 32.dp),
        verticalArrangement = Arrangement.spacedBy(16.dp, Alignment.CenterVertically),
        horizontalAlignment = Alignment.CenterHorizontally
    ) {
        Text(
            text = text,
            style = MaterialTheme.typography.bodyLarge,
            textAlign = TextAlign.Center,
            modifier = Modifier.testTag(textTag)
        )
        OutlinedButton(onClick = onClick, modifier = Modifier.testTag(buttonTag)) {
            Text(text = buttonText)
        }
    }
}

private fun formatPrice(price: Double): String = NumberFormat.getCurrencyInstance(Locale.CANADA).format(price)
