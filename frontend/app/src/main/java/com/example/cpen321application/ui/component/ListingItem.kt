package com.example.cpen321application.ui.component

import android.graphics.Camera
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.width
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.tooling.preview.PreviewLightDark
import com.example.cpen321application.ui.theme.CPEN321ApplicationTheme

import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import com.example.cpen321application.remote.data.response.SellingListingDto
import java.util.Date
import java.util.Locale

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.*
import androidx.compose.ui.text.font.FontWeight

import coil3.compose.AsyncImage
import androidx.compose.ui.layout.ContentScale

@Composable
fun ListingItem(
    item: SellingListingDto,
    modifier: Modifier = Modifier,
) {
    Card(
        modifier = modifier.width(180.dp),
        shape = RoundedCornerShape(16.dp),
        colors = CardDefaults.cardColors(
            containerColor = MaterialTheme.colorScheme.surface,
        ),
        elevation = CardDefaults.cardElevation(
            defaultElevation = 2.dp,
        ),
    ) {
        // Photo placeholder — replace with an image later.
        AsyncImage(
            model = item.itemImageURL,
            contentDescription = item.itemName,
            modifier = Modifier
                .fillMaxWidth()
                .aspectRatio(1f),
            contentScale = ContentScale.Crop,
        )

        Column(
            modifier = Modifier.padding(12.dp),
            verticalArrangement = Arrangement.spacedBy(6.dp),
        ) {
            Text(
                text = item.itemName,
                style = MaterialTheme.typography.bodyLarge,
                fontWeight = FontWeight.Medium,
                minLines = 2,
                maxLines = 2,
                overflow = TextOverflow.Ellipsis,
            )

            Text(
                text = String.format(
                    Locale.CANADA,
                    "CA$%.2f",
                    item.itemPrice,
                ),
                style = MaterialTheme.typography.titleMedium,
                fontWeight = FontWeight.Bold,
                color = MaterialTheme.colorScheme.primary,
            )

            Spacer(modifier = Modifier.height(4.dp))

            Text(
                text = item.sellerName,
                style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
                maxLines = 1,
                overflow = TextOverflow.Ellipsis,
            )
        }
    }
}


@PreviewLightDark
@Composable
fun ListingItemPreview(){
    CPEN321ApplicationTheme {
        Surface(
            modifier = Modifier.fillMaxSize()
        ) {
            Column(
                modifier = Modifier.fillMaxSize(),
                verticalArrangement = Arrangement.Center,
                horizontalAlignment = Alignment.CenterHorizontally,
            ) {
                ListingItem(
                    SellingListingDto(
                        itemName = "Camera",
                        itemPrice = 1000.00f,
                        sellerName = "Chee Seng",
                        listingDate = Date(),
                        itemImageURL = "https://img.vistek.net/prodimg/xlarge/458908.jpg"
                    )
                )
            }
        }
    }
}