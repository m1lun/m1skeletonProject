package com.example.cpen321application.feed

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.lazy.rememberLazyListState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
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
import androidx.compose.ui.draw.clip
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import com.example.cpen321application.R
import com.example.cpen321application.post.RemoteImage
import java.text.NumberFormat
import java.util.Locale

private const val LOAD_AHEAD = 5
private const val DESCRIPTION_LINES = 2
private val PHOTO_SIZE = 72.dp

object FeedTags {
    const val RETRY = "feed_retry"
    const val REFRESH = "feed_refresh"
}

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
            buttonTag = FeedTags.RETRY,
            onClick = onLoadMore,
            modifier = modifier
        )
        nothingShown && state.endReached -> FeedMessage(
            text = stringResource(R.string.feed_empty),
            buttonText = stringResource(R.string.btn_refresh),
            buttonTag = FeedTags.REFRESH,
            onClick = onRefresh,
            modifier = modifier
        )
        nothingShown -> Box(modifier = modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
            CircularProgressIndicator()
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
        modifier = modifier.fillMaxSize()
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
            CircularProgressIndicator()
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
        modifier = Modifier.fillMaxWidth(),
        shape = RoundedCornerShape(16.dp),
        colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surfaceContainerLow),
        elevation = CardDefaults.cardElevation(defaultElevation = 2.dp)
    ) {
        Row(
            modifier = Modifier.padding(all = 12.dp),
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.spacedBy(12.dp)
        ) {
            listing.photoId?.let {
                RemoteImage(id = it, modifier = Modifier.size(PHOTO_SIZE).clip(RoundedCornerShape(12.dp)))
            }
            ListingText(listing, modifier = Modifier.weight(1f))
        }
    }
}

@Composable
private fun ListingText(listing: FeedListing, modifier: Modifier = Modifier) {
    Column(modifier = modifier, verticalArrangement = Arrangement.spacedBy(4.dp)) {
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

@Composable
private fun FeedMessage(
    text: String,
    buttonText: String,
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
            textAlign = TextAlign.Center
        )
        OutlinedButton(onClick = onClick, modifier = Modifier.testTag(buttonTag)) {
            Text(text = buttonText)
        }
    }
}

private fun formatPrice(price: Double): String = NumberFormat.getCurrencyInstance(Locale.CANADA).format(price)
