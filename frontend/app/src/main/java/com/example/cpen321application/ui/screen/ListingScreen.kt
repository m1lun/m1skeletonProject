package com.example.cpen321application.ui.screen

import androidx.compose.animation.animateColorAsState
import androidx.compose.animation.core.animateDpAsState
import androidx.compose.animation.core.tween
import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.background
import androidx.compose.foundation.isSystemInDarkTheme
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.grid.GridCells
import androidx.compose.foundation.lazy.grid.GridItemSpan
import androidx.compose.foundation.lazy.grid.LazyVerticalGrid
import androidx.compose.foundation.lazy.grid.items
import androidx.compose.foundation.selection.selectable
import androidx.compose.foundation.selection.selectableGroup
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.shadow
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.SolidColor
import androidx.compose.ui.graphics.StrokeCap
import androidx.compose.ui.graphics.StrokeJoin
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.graphics.vector.PathParser
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.platform.LocalInspectionMode
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.tooling.preview.Preview
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import coil3.compose.AsyncImage
import java.util.Locale

/*
 * UI demo only: sample listings, local search, Buy/Sell switch and tab selection.
 * Requires the two Coil 3.2.0 dependencies already added to app/build.gradle.kts.
 * Icons are included below; no material-icons-extended dependency is needed.
 * No backend calls, sign-in, DTO changes, database writes or real cart actions.
 *
 * Setup:
 * 1. Save as ui/screen/ListingScreen.kt in your Android source package.
 * 2. Import com.example.cpen321application.ui.screen.ListingScreen in MainActivity.
 * 3. In your temporary UI-testing activity: setContent { ListingScreen() }.
 * 4. Keep INTERNET permission. Run the emulator to load network photos.
 *    Android Studio Preview displays photo placeholders by design.
 *
 * Buy displays seller listings; Sell displays mock buyer requests.
 * Bottom tabs show UI placeholders. List opens a placeholder, not a posting form.
 * All displayed prices, people, conditions and requests are fictional samples.
 */
@Composable
fun ListingScreen(modifier: Modifier = Modifier) {
    ListingScreenTheme {
        var mode by rememberSaveable { mutableStateOf("Buy") }
        var query by rememberSaveable { mutableStateOf("") }
        var selectedTab by rememberSaveable { mutableStateOf("Explore") }
        var savedIds by rememberSaveable { mutableStateOf(listOf<String>()) }
        var selectedItem by remember { mutableStateOf<SampleListing?>(null) }

        val sampleItems = remember(mode) { sampleListings(mode) }
        val visibleItems = remember(sampleItems, query) {
            sampleItems.filter {
                it.title.contains(query.trim(), ignoreCase = true) ||
                    it.person.contains(query.trim(), ignoreCase = true)
            }
        }

        Scaffold(
            modifier = modifier.fillMaxSize(),
            containerColor = MaterialTheme.colorScheme.background,
            contentWindowInsets = WindowInsets.safeDrawing,
            topBar = {
                if (selectedTab == "Explore") {
                    ExploreHeader(
                        mode = mode,
                        onModeChange = { mode = it },
                        query = query,
                        onQueryChange = { query = it },
                    )
                }
            },
            bottomBar = {
                MarketBottomBar(
                    selectedTab = selectedTab,
                    onTabSelected = { selectedTab = it },
                )
            },
        ) { innerPadding ->
            if (selectedTab == "Explore") {
                // Start a new grid composition when switching marketplace modes.
                key(mode) {
                    LazyVerticalGrid(
                        columns = GridCells.Fixed(2),
                        modifier = Modifier
                            .fillMaxSize()
                            .padding(innerPadding)
                            .consumeWindowInsets(innerPadding),
                        contentPadding = PaddingValues(start = 20.dp, end = 20.dp, bottom = 24.dp),
                        horizontalArrangement = Arrangement.spacedBy(12.dp),
                        verticalArrangement = Arrangement.spacedBy(16.dp),
                    ) {
                        item(span = { GridItemSpan(maxLineSpan) }) {
                            Column(modifier = Modifier.padding(top = 8.dp, bottom = 6.dp)) {
                                Text(
                                    text = if (mode == "Buy") "Find your next favourite." else "Find your next buyer.",
                                    fontSize = 24.sp,
                                    lineHeight = 30.sp,
                                    letterSpacing = (-0.7).sp,
                                    fontWeight = FontWeight.Bold,
                                )
                                Spacer(Modifier.height(6.dp))
                                Text(
                                    text = if (mode == "Buy") "Good finds. A little closer to home."
                                        else "See what people are looking for.",
                                    fontSize = 13.sp,
                                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                                )
                                Spacer(Modifier.height(22.dp))
                                Row(
                                    modifier = Modifier.fillMaxWidth(),
                                    verticalAlignment = Alignment.CenterVertically,
                                ) {
                                    Text(
                                        text = if (query.isBlank()) {
                                            if (mode == "Buy") "Fresh finds" else "Buyer requests"
                                        } else "Search results",
                                        modifier = Modifier.weight(1f),
                                        fontSize = 16.sp,
                                        fontWeight = FontWeight.SemiBold,
                                    )
                                    Text(
                                        text = "${visibleItems.size} ${if (mode == "Buy") "items" else "requests"}",
                                        fontSize = 12.sp,
                                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                                    )
                                }
                            }
                        }
                        if (visibleItems.isEmpty()) {
                            item(span = { GridItemSpan(maxLineSpan) }) {
                                EmptyPanel(
                                    icon = MarketIcons.Search,
                                    title = "No matches yet",
                                    description = "Try a different item name or clear your search.",
                                    modifier = Modifier.fillMaxWidth().padding(vertical = 40.dp),
                                )
                            }
                        }
                        items(visibleItems, key = { it.id }) { listing ->
                            MarketListingCard(
                                item = listing,
                                isRequest = mode == "Sell",
                                saved = listing.id in savedIds,
                                onSave = {
                                    savedIds = if (listing.id in savedIds) savedIds - listing.id
                                        else savedIds + listing.id
                                },
                                onClick = { selectedItem = listing },
                            )
                        }
                    }
                }
            } else {
                val tab = navItems.first { it.label == selectedTab }
                Box(
                    modifier = Modifier.fillMaxSize().padding(innerPadding),
                    contentAlignment = Alignment.Center,
                ) {
                    EmptyPanel(
                        icon = tab.icon,
                        title = when (selectedTab) {
                            "Cart" -> "Your cart is empty"
                            "List" -> "Your next match starts here"
                            "Message" -> "Start a conversation"
                            else -> "Your corner of MatchMarket"
                        },
                        description = when (selectedTab) {
                            "Cart" -> "Items you add to your cart will appear here."
                            "List" -> "Share an item for sale or post what you're looking for."
                            "Message" -> "Your conversations with buyers and sellers will appear here."
                            else -> "Your profile and posts, all in one place."
                        },
                        modifier = Modifier.padding(32.dp),
                    )
                }
            }
        }

        // A small local detail preview; this does not contact a backend.
        selectedItem?.let { item ->
            AlertDialog(
                onDismissRequest = { selectedItem = null },
                shape = RoundedCornerShape(24.dp),
                title = { Text(item.title, fontWeight = FontWeight.SemiBold) },
                text = {
                    Column(verticalArrangement = Arrangement.spacedBy(10.dp)) {
                        Text(if (mode == "Sell") "Budget: ${price(item.price)}" else price(item.price))
                        Text("${if (mode == "Buy") "Seller" else "Buyer"}: ${item.person}")
                        Text(item.detail)
                    }
                },
                confirmButton = { TextButton(onClick = { selectedItem = null }) { Text("Done") } },
            )
        }
    }
}

@Composable
private fun ExploreHeader(
    mode: String,
    onModeChange: (String) -> Unit,
    query: String,
    onQueryChange: (String) -> Unit,
) {
    Surface(color = MaterialTheme.colorScheme.background) {
        Column(
            modifier = Modifier
                .fillMaxWidth()
                .windowInsetsPadding(WindowInsets.safeDrawing.only(WindowInsetsSides.Top + WindowInsetsSides.Horizontal))
                .padding(horizontal = 20.dp, vertical = 12.dp),
            verticalArrangement = Arrangement.spacedBy(14.dp),
        ) {
            Row(
                modifier = Modifier.fillMaxWidth(),
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.SpaceBetween,
            ) {
                BuySellSwitch(mode, onModeChange)
                Text(
                    text = "MatchMarket",
                    fontSize = 16.sp,
                    letterSpacing = (-0.5).sp,
                    fontWeight = FontWeight.Bold,
                )
            }
            TextField(
                value = query,
                onValueChange = onQueryChange,
                modifier = Modifier.fillMaxWidth(),
                singleLine = true,
                textStyle = MaterialTheme.typography.bodyMedium,
                placeholder = {
                    Text(
                        text = "Search MatchMarket",
                        color = MaterialTheme.colorScheme.onSurfaceVariant.copy(alpha = 0.72f),
                        fontSize = 14.sp,
                    )
                },
                leadingIcon = { Icon(MarketIcons.Search, contentDescription = null, modifier = Modifier.size(21.dp)) },
                trailingIcon = if (query.isNotEmpty()) {
                    { IconButton(onClick = { onQueryChange("") }) {
                        Icon(MarketIcons.Close, contentDescription = "Clear search", modifier = Modifier.size(18.dp))
                    } }
                } else null,
                shape = RoundedCornerShape(18.dp),
                colors = TextFieldDefaults.colors(
                    focusedContainerColor = MaterialTheme.colorScheme.surfaceVariant,
                    unfocusedContainerColor = MaterialTheme.colorScheme.surfaceVariant,
                    focusedIndicatorColor = Color.Transparent,
                    unfocusedIndicatorColor = Color.Transparent,
                    disabledIndicatorColor = Color.Transparent,
                    cursorColor = MaterialTheme.colorScheme.primary,
                    focusedLeadingIconColor = MaterialTheme.colorScheme.onSurfaceVariant,
                    unfocusedLeadingIconColor = MaterialTheme.colorScheme.onSurfaceVariant,
                ),
            )
        }
    }
}

@Composable
private fun BuySellSwitch(mode: String, onModeChange: (String) -> Unit) {
    // iOS-style sliding thumb; the labels always remain visible.
    val thumbOffset by animateDpAsState(
        targetValue = if (mode == "Buy") 0.dp else 70.dp,
        animationSpec = tween(durationMillis = 220),
        label = "BuySellThumb",
    )
    Box(
        modifier = Modifier
            .width(148.dp)
            .height(52.dp)
            .clip(RoundedCornerShape(17.dp))
            .background(MaterialTheme.colorScheme.surfaceVariant)
            .padding(4.dp),
    ) {
        Box(
            modifier = Modifier
                .offset(x = thumbOffset)
                .width(70.dp)
                .fillMaxHeight()
                .shadow(2.dp, RoundedCornerShape(13.dp))
                .background(MaterialTheme.colorScheme.surface, RoundedCornerShape(13.dp)),
        )
        Row(modifier = Modifier.fillMaxSize().selectableGroup()) {
            listOf("Buy", "Sell").forEach { label ->
                val textColor by animateColorAsState(
                    targetValue = if (mode == label) MaterialTheme.colorScheme.onSurface
                        else MaterialTheme.colorScheme.onSurfaceVariant,
                    label = "ModeText",
                )
                Box(
                    modifier = Modifier
                        .weight(1f)
                        .fillMaxHeight()
                        .clip(RoundedCornerShape(13.dp))
                        .selectable(selected = mode == label, role = Role.Tab, onClick = { onModeChange(label) }),
                    contentAlignment = Alignment.Center,
                ) {
                    Text(label, fontSize = 14.sp, fontWeight = FontWeight.SemiBold, color = textColor)
                }
            }
        }
    }
}

@Composable
private fun MarketListingCard(
    item: SampleListing,
    isRequest: Boolean,
    saved: Boolean,
    onSave: () -> Unit,
    onClick: () -> Unit,
) {
    Card(
        onClick = onClick,
        modifier = Modifier.fillMaxWidth(),
        shape = RoundedCornerShape(20.dp),
        border = BorderStroke(1.dp, MaterialTheme.colorScheme.outlineVariant),
        colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surface),
    ) {
        Box(modifier = Modifier.fillMaxWidth().aspectRatio(1f).background(Color(0xFFF1F1EF))) {
            ListingPhoto(item, Modifier.fillMaxSize())
            Surface(
                modifier = Modifier.align(Alignment.BottomStart).padding(10.dp),
                shape = RoundedCornerShape(7.dp),
                color = Color.White.copy(alpha = 0.95f),
                contentColor = Color(0xFF353936),
            ) {
                Text(
                    if (isRequest) "WANTED" else item.condition.uppercase(Locale.CANADA),
                    modifier = Modifier.padding(horizontal = 7.dp, vertical = 4.dp),
                    fontSize = 9.sp,
                    letterSpacing = 0.5.sp,
                    fontWeight = FontWeight.SemiBold,
                )
            }
            IconToggleButton(
                checked = saved,
                onCheckedChange = { onSave() },
                modifier = Modifier.align(Alignment.TopEnd).padding(2.dp),
            ) {
                Box(
                    modifier = Modifier.size(32.dp).background(Color.White.copy(alpha = 0.95f), CircleShape),
                    contentAlignment = Alignment.Center,
                ) {
                    Icon(
                        imageVector = if (saved) MarketIcons.HeartFilled else MarketIcons.Heart,
                        contentDescription = if (saved) "Unsave ${item.title}" else "Save ${item.title}",
                        tint = if (saved) Color(0xFFB14649) else Color(0xFF454B47),
                        modifier = Modifier.size(18.dp),
                    )
                }
            }
        }
        Column(modifier = Modifier.padding(12.dp), verticalArrangement = Arrangement.spacedBy(5.dp)) {
            Text(
                item.title,
                style = MaterialTheme.typography.bodyMedium,
                fontWeight = FontWeight.Medium,
                minLines = 2,
                maxLines = 2,
                overflow = TextOverflow.Ellipsis,
            )
            Text(
                text = if (isRequest) "Up to ${price(item.price)}" else price(item.price),
                fontSize = 17.sp,
                letterSpacing = (-0.4).sp,
                fontWeight = FontWeight.Bold,
            )
            Spacer(Modifier.height(4.dp))
            Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                Box(
                    modifier = Modifier.size(22.dp).background(MaterialTheme.colorScheme.surfaceVariant, CircleShape),
                    contentAlignment = Alignment.Center,
                ) {
                    Text(item.person.take(1), fontSize = 10.sp, fontWeight = FontWeight.SemiBold)
                }
                Text(
                    item.person,
                    fontSize = 11.sp,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                    maxLines = 1,
                    overflow = TextOverflow.Ellipsis,
                )
            }
        }
    }
}

@Composable
private fun ListingPhoto(item: SampleListing, modifier: Modifier = Modifier) {
    var failed by remember(item.imageUrl) { mutableStateOf(false) }
    if (LocalInspectionMode.current || failed) {
        // Preview cannot download online images. This keeps the layout visible.
        Box(modifier.background(Color(0xFFF1F1EF)), contentAlignment = Alignment.Center) {
            Icon(MarketIcons.Photo, contentDescription = "Item photo unavailable", tint = Color(0xFF9BA19C), modifier = Modifier.size(36.dp))
        }
    } else {
        AsyncImage(
            model = item.imageUrl,
            contentDescription = item.title,
            modifier = modifier,
            contentScale = if (item.id.endsWith("camera")) ContentScale.Fit else ContentScale.Crop,
            onError = { failed = true },
        )
    }
}

private data class NavItem(val label: String, val icon: ImageVector)
private val navItems by lazy {
    listOf(
        NavItem("Explore", MarketIcons.Explore),
        NavItem("Cart", MarketIcons.Cart),
        NavItem("List", MarketIcons.Plus),
        NavItem("Message", MarketIcons.Message),
        NavItem("Me", MarketIcons.Person),
    )
}

@Composable
private fun MarketBottomBar(selectedTab: String, onTabSelected: (String) -> Unit) {
    Surface(
        color = MaterialTheme.colorScheme.surface,
        shadowElevation = 8.dp,
        shape = RoundedCornerShape(topStart = 24.dp, topEnd = 24.dp),
    ) {
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .windowInsetsPadding(WindowInsets.safeDrawing.only(WindowInsetsSides.Bottom + WindowInsetsSides.Horizontal))
                .padding(horizontal = 8.dp, vertical = 8.dp)
                .selectableGroup(),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            navItems.forEach { tab ->
                val selected = selectedTab == tab.label
                val tint by animateColorAsState(
                    targetValue = if (selected) MaterialTheme.colorScheme.primary
                        else MaterialTheme.colorScheme.onSurfaceVariant,
                    label = "NavTint",
                )
                Column(
                    modifier = Modifier
                        .weight(1f)
                        .heightIn(min = 68.dp)
                        .clip(RoundedCornerShape(16.dp))
                        .selectable(selected = selected, role = Role.Tab, onClick = { onTabSelected(tab.label) }),
                    horizontalAlignment = Alignment.CenterHorizontally,
                    verticalArrangement = Arrangement.Center,
                ) {
                    if (tab.label == "List") {
                        Box(
                            modifier = Modifier
                                .size(46.dp)
                                .shadow(3.dp, RoundedCornerShape(15.dp))
                                .background(MaterialTheme.colorScheme.primary, RoundedCornerShape(15.dp)),
                            contentAlignment = Alignment.Center,
                        ) {
                            Icon(tab.icon, contentDescription = null, tint = MaterialTheme.colorScheme.onPrimary, modifier = Modifier.size(26.dp))
                        }
                    } else {
                        Box(modifier = Modifier.size(width = 46.dp, height = 40.dp), contentAlignment = Alignment.Center) {
                            Icon(tab.icon, contentDescription = null, tint = tint, modifier = Modifier.size(24.dp))
                        }
                    }
                    Spacer(Modifier.height(4.dp))
                    Text(tab.label, fontSize = 10.sp, color = tint, fontWeight = if (selected) FontWeight.Bold else FontWeight.Medium)
                }
            }
        }
    }
}

@Composable
private fun EmptyPanel(icon: ImageVector, title: String, description: String, modifier: Modifier = Modifier) {
    Column(modifier, horizontalAlignment = Alignment.CenterHorizontally, verticalArrangement = Arrangement.spacedBy(12.dp)) {
        Box(
            modifier = Modifier.size(72.dp).background(MaterialTheme.colorScheme.surfaceVariant, RoundedCornerShape(24.dp)),
            contentAlignment = Alignment.Center,
        ) { Icon(icon, contentDescription = null, modifier = Modifier.size(30.dp)) }
        Text(title, fontSize = 20.sp, fontWeight = FontWeight.SemiBold, textAlign = androidx.compose.ui.text.style.TextAlign.Center)
        Text(description, fontSize = 14.sp, color = MaterialTheme.colorScheme.onSurfaceVariant, textAlign = androidx.compose.ui.text.style.TextAlign.Center)
    }
}

@Composable
private fun ListingScreenTheme(content: @Composable () -> Unit) {
    val scheme = if (isSystemInDarkTheme()) {
        darkColorScheme(
            primary = Color(0xFFC5D8C9), onPrimary = Color(0xFF18271D),
            background = Color(0xFF141615), onBackground = Color(0xFFF2F4F1),
            surface = Color(0xFF202321), onSurface = Color(0xFFF2F4F1),
            surfaceVariant = Color(0xFF2C302D), onSurfaceVariant = Color(0xFFB3BBB5),
            outlineVariant = Color(0xFF343A36),
        )
    } else {
        lightColorScheme(
            primary = Color(0xFF263E30), onPrimary = Color.White,
            background = Color(0xFFFAFAF8), onBackground = Color(0xFF202620),
            surface = Color.White, onSurface = Color(0xFF202620),
            surfaceVariant = Color(0xFFEEEFEA), onSurfaceVariant = Color(0xFF737B74),
            outlineVariant = Color(0xFFE8EBE5),
        )
    }
    MaterialTheme(colorScheme = scheme, content = content)
}

// Sample data is intentionally separate from your backend DTOs.
private data class SampleListing(
    val id: String,
    val title: String,
    val price: Int,
    val person: String,
    val condition: String,
    val imageUrl: String,
    val detail: String,
)

private fun price(value: Int): String = String.format(Locale.CANADA, "CA$%,d", value)

private fun sampleListings(mode: String): List<SampleListing> {
    val items = listOf(
        SampleListing("Leica", "Leica compact camera", 1000, "Chee Seng", "Like new",
            "https://img.vistek.net/prodimg/xlarge/458908.jpg", "A compact camera for everyday photography."),
        SampleListing("chair", "Everyday lounge chair", 65, "Alex", "Good",
            "https://encrypted-tbn0.gstatic.com/images?q=tbn:ANd9GcTCzoVq1qP67_0R2tiGtP4HnNGd67cenR01mwp5Az9ggA&s=10", "A comfortable chair for a reading corner."),
        SampleListing("headphones", "Over-ear headphones", 120, "Maya", "Like new",
            "https://encrypted-tbn0.gstatic.com/images?q=tbn:ANd9GcRoD_kKRW2ZdHDxmIrWqWym0EMijtFRKJzuUYLjR5zQoQ&s=10", "Over-ear headphones for music and studying."),
        SampleListing("shoes", "Everyday trainers", 45, "Jordan", "Good",
            "https://encrypted-tbn0.gstatic.com/images?q=tbn:ANd9GcS4D0ytq1RHHsXr-RgNLxa1WN3t0-HDNDko6XxrhkD-JQ&s=10", "A pair of trainers for everyday wear."),
        SampleListing("plant", "A little green for home", 18, "Sam", "New",
            "https://encrypted-tbn0.gstatic.com/images?q=tbn:ANd9GcQOzgD2rfn6rQwFADUtMn-eBCpAlw_SjZQI5NrRXL6y3A&s=10", "A small potted plant for a desk or windowsill."),
        SampleListing("backpack", "Weekend backpack", 35, "Jamie", "Good",
            "https://encrypted-tbn0.gstatic.com/images?q=tbn:ANd9GcQjCqkwXvcPuIEtKFx5I2CqPA37rzS24kosm04UbcnGYA&s=10", "A backpack for classes and weekend outings."),
    )
    return if (mode == "Buy") items else items.map {
        it.copy(id = "request-${it.id}", title = "Looking for: ${it.title}", detail = "Looking for this type of item within the displayed budget.")
    }
}

// Small original outline vectors keep this file independent of icon libraries.
private object MarketIcons {
    private fun vector(name: String, data: String, filled: Boolean = false): ImageVector =
        ImageVector.Builder(name = name, defaultWidth = 24.dp, defaultHeight = 24.dp, viewportWidth = 24f, viewportHeight = 24f)
            .addPath(
                pathData = PathParser().parsePathString(data).toNodes(),
                fill = if (filled) SolidColor(Color.Black) else null,
                stroke = SolidColor(Color.Black),
                strokeLineWidth = 1.7f,
                strokeLineCap = StrokeCap.Round,
                strokeLineJoin = StrokeJoin.Round,
            ).build()

    val Search = vector("Search", "M 20 20 L 15.7 15.7 M 17.5 10.5 A 7 7 0 1 1 3.5 10.5 A 7 7 0 1 1 17.5 10.5")
    val Close = vector("Close", "M 6 6 L 18 18 M 18 6 L 6 18")
    val Explore = vector("Explore", "M 21 12 A 9 9 0 1 1 3 12 A 9 9 0 1 1 21 12 M 15.8 8.2 L 13.5 13.5 L 8.2 15.8 L 10.5 10.5 Z")
    val Cart = vector("Cart", "M 2 3 L 5 3 L 7.5 15.5 L 19 15.5 L 21 7 L 6 7 M 10 20 A 1 1 0 1 1 8 20 A 1 1 0 1 1 10 20 M 19 20 A 1 1 0 1 1 17 20 A 1 1 0 1 1 19 20")
    val Plus = vector("Plus", "M 12 5 L 12 19 M 5 12 L 19 12")
    val Message = vector("Message", "M 6 4 L 18 4 Q 21 4 21 7 L 21 15 Q 21 18 18 18 L 9 18 L 4 21 L 4 17 Q 3 16 3 14 L 3 7 Q 3 4 6 4 Z M 7 9 L 17 9 M 7 13 L 14 13")
    val Person = vector("Person", "M 16 7 A 4 4 0 1 1 8 7 A 4 4 0 1 1 16 7 M 4 21 L 4 19 Q 4 14 12 14 Q 20 14 20 19 L 20 21")
    private const val HEART_PATH = "M 12 20 L 3.8 12 Q -0.2 7 4.2 4.2 Q 8 2 12 6 Q 16 2 19.8 4.2 Q 24.2 7 20.2 12 Z"
    val Heart = vector("Heart", HEART_PATH)
    val HeartFilled = vector("HeartFilled", HEART_PATH, filled = true)
    val Photo = vector("Photo", "M 5 3 L 19 3 Q 21 3 21 5 L 21 19 Q 21 21 19 21 L 5 21 Q 3 21 3 19 L 3 5 Q 3 3 5 3 Z M 3 17 L 9 11 L 14 16 L 17 13 L 21 17 M 17 7 A 1 1 0 1 1 15 7 A 1 1 0 1 1 17 7")
}

@Preview(name = "Explore - Light", showBackground = true, widthDp = 412, heightDp = 892)
@Preview(name = "Explore - Dark", showBackground = true, widthDp = 412, heightDp = 892, uiMode = android.content.res.Configuration.UI_MODE_NIGHT_YES)
@Composable
private fun ListingScreenPreview() {
    ListingScreen()
}
