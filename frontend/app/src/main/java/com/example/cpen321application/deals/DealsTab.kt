package com.example.cpen321application.deals

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
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.Text
import androidx.compose.material3.pulltorefresh.PullToRefreshBox
import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.derivedStateOf
import androidx.compose.runtime.getValue
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import com.example.cpen321application.R
import com.example.cpen321application.post.RemoteImage
import com.example.cpen321application.post.titleCase
import java.text.NumberFormat
import java.util.Locale

private const val LOAD_AHEAD = 5
private val PHOTO_SIZE = 56.dp

object DealsTags {
    const val RETRY = "deals_retry"
    const val REFRESH = "deals_refresh"
    const val RATE = "deals_rate"
}

@Composable
fun DealsTab(viewModel: DealsViewModel, onSignedOut: () -> Unit, innerPadding: PaddingValues) {
    val state = viewModel.state
    // Every visit to the tab fetches the first page; the deals already loaded stay on screen meanwhile.
    LaunchedEffect(Unit) { viewModel.refresh() }
    DisposableEffect(Unit) { onDispose { viewModel.stop() } }
    LaunchedEffect(state.signedOut) {
        if (state.signedOut) onSignedOut()
    }

    Column(modifier = Modifier.fillMaxSize().padding(innerPadding)) {
        Text(
            text = stringResource(R.string.deals_title),
            style = MaterialTheme.typography.headlineMedium,
            fontWeight = FontWeight.SemiBold,
            modifier = Modifier.padding(start = 16.dp, top = 16.dp, end = 16.dp),
        )
        DealsContent(state, viewModel::loadMore, viewModel::refresh, viewModel::startRating, Modifier.weight(1f))
    }
    if (viewModel.rating.dealId != null) {
        RateDealDialog(viewModel.rating, viewModel::submitRating, viewModel::dismissRating)
    }
}

@Composable
private fun DealsContent(
    state: DealsUiState,
    onLoadMore: () -> Unit,
    onRefresh: () -> Unit,
    onRate: (String) -> Unit,
    modifier: Modifier = Modifier
) {
    val nothingShown = state.deals.isEmpty()
    when {
        nothingShown && state.loadFailed -> DealsMessage(
            text = stringResource(R.string.error_unreachable),
            buttonText = stringResource(R.string.btn_retry),
            buttonTag = DealsTags.RETRY,
            onClick = onRefresh,
            modifier = modifier
        )
        nothingShown && state.endReached -> DealsMessage(
            text = stringResource(R.string.deals_empty),
            buttonText = stringResource(R.string.btn_refresh),
            buttonTag = DealsTags.REFRESH,
            onClick = onRefresh,
            modifier = modifier
        )
        nothingShown -> Box(modifier = modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
            CircularProgressIndicator()
        }
        else -> DealsList(state, onLoadMore, onRefresh, onRate, modifier)
    }
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
private fun DealsList(
    state: DealsUiState,
    onLoadMore: () -> Unit,
    onRefresh: () -> Unit,
    onRate: (String) -> Unit,
    modifier: Modifier = Modifier
) {
    val listState = rememberLazyListState()
    val nearEnd by remember {
        derivedStateOf {
            val lastVisible = listState.layoutInfo.visibleItemsInfo.lastOrNull()?.index ?: 0
            lastVisible >= listState.layoutInfo.totalItemsCount - LOAD_AHEAD
        }
    }
    // Asks again each time more deals arrive, so a long scroll keeps loading pages.
    LaunchedEffect(nearEnd, state.deals.size) {
        if (nearEnd) onLoadMore()
    }
    // A refresh can put newer deals above the first one on screen; scroll up so they are seen.
    LaunchedEffect(state.deals.firstOrNull()?.id) { listState.scrollToItem(0) }

    PullToRefreshBox(isRefreshing = state.isRefreshing, onRefresh = onRefresh, modifier = modifier) {
        LazyColumn(
            state = listState,
            contentPadding = PaddingValues(all = 16.dp),
            verticalArrangement = Arrangement.spacedBy(12.dp),
            modifier = Modifier.fillMaxSize()
        ) {
            items(state.deals, key = { it.id }) { deal -> DealCard(deal, onRate) }
            item { DealsFooter(state, onRetry = onLoadMore) }
        }
    }
}

@Composable
private fun DealsFooter(state: DealsUiState, onRetry: () -> Unit) {
    Box(modifier = Modifier.fillMaxWidth(), contentAlignment = Alignment.Center) {
        if (state.isLoading && !state.isRefreshing) {
            CircularProgressIndicator()
        } else if (state.loadFailed) {
            OutlinedButton(onClick = onRetry, modifier = Modifier.testTag(DealsTags.RETRY)) {
                Text(text = stringResource(R.string.btn_retry))
            }
        }
    }
}

@Composable
private fun DealCard(deal: Deal, onRate: (String) -> Unit) {
    Card(
        modifier = Modifier.fillMaxWidth(),
        shape = RoundedCornerShape(16.dp),
        colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surfaceContainerLow),
        elevation = CardDefaults.cardElevation(defaultElevation = 2.dp)
    ) {
        Column(modifier = Modifier.padding(all = 12.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
            Text(
                text = deal.title.ifBlank { stringResource(R.string.deals_untitled) }.titleCase(),
                style = MaterialTheme.typography.titleLarge
            )
            deal.listing?.let { PostBlock(stringResource(R.string.deals_listing), it, showPrice = true) }
            deal.request?.let { PostBlock(stringResource(R.string.deals_request), it, showPrice = false) }
            DealSummary(deal, onRate)
        }
    }
}

@Composable
private fun PostBlock(label: String, post: DealPost, showPrice: Boolean) {
    Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(12.dp)) {
        post.photoId?.let {
            RemoteImage(id = it, modifier = Modifier.size(PHOTO_SIZE).clip(RoundedCornerShape(12.dp)))
        }
        Column(verticalArrangement = Arrangement.spacedBy(2.dp)) {
            Text(
                text = label,
                style = MaterialTheme.typography.labelMedium,
                color = MaterialTheme.colorScheme.onSurfaceVariant
            )
            Text(text = post.category.titleCase(), style = MaterialTheme.typography.titleMedium)
            post.price?.takeIf { showPrice }?.let { Text(text = money(it), style = MaterialTheme.typography.bodyMedium) }
        }
    }
}

@Composable
private fun DealSummary(deal: Deal, onRate: (String) -> Unit) {
    val role = stringResource(if (deal.role == DealRole.SELLER) R.string.deals_sold_to else R.string.deals_bought_from)
    Column(verticalArrangement = Arrangement.spacedBy(4.dp)) {
        Text(
            text = stringResource(R.string.deals_agreed_price, money(deal.agreedPrice)),
            style = MaterialTheme.typography.titleMedium
        )
        Text(text = "$role · ${scoreText(deal.otherUser)}", style = MaterialTheme.typography.bodyMedium)
        if (deal.myRating == null) {
            OutlinedButton(onClick = { onRate(deal.id) }, modifier = Modifier.testTag(DealsTags.RATE)) {
                Text(text = stringResource(R.string.deals_rate))
            }
        } else {
            Text(text = stringResource(R.string.deals_you_rated, starsText(deal.myRating.stars)), style = MaterialTheme.typography.bodyMedium)
        }
        deal.theirRating?.let {
            Text(text = stringResource(R.string.deals_they_rated, starsText(it.stars)), style = MaterialTheme.typography.bodyMedium)
            if (it.comment.isNotBlank()) {
                Text(
                    text = it.comment,
                    style = MaterialTheme.typography.bodyMedium,
                    color = MaterialTheme.colorScheme.onSurfaceVariant
                )
            }
        }
        Text(
            text = deal.createdAt,
            style = MaterialTheme.typography.bodySmall,
            color = MaterialTheme.colorScheme.onSurfaceVariant
        )
    }
}

@Composable
private fun DealsMessage(
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
        Text(text = text, style = MaterialTheme.typography.bodyLarge, textAlign = TextAlign.Center)
        OutlinedButton(onClick = onClick, modifier = Modifier.testTag(buttonTag)) {
            Text(text = buttonText)
        }
    }
}

@Composable
private fun scoreText(user: OtherUser): String =
    user.score?.let { stringResource(R.string.deals_score, it, user.ratingCount) }
        ?: stringResource(R.string.deals_score_new)

private fun starsText(stars: Int): String = "★".repeat(stars) + "☆".repeat(MAX_STARS - stars)

private fun money(amount: Double): String = NumberFormat.getCurrencyInstance(Locale.CANADA).format(amount)
