package com.example.cpen321application.post

import android.graphics.Bitmap
import android.graphics.BitmapFactory
import android.util.LruCache
import androidx.compose.foundation.Image
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.background
import androidx.compose.material3.MaterialTheme
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.produceState
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.asImageBitmap
import androidx.compose.ui.layout.ContentScale
import com.example.cpen321application.BuildConfig
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import okhttp3.OkHttpClient
import okhttp3.Request

/** Minimal image loader (OkHttp + in-memory cache) so no image library is needed. */
private object ImageCache {
    val client = OkHttpClient()
    val cache = object : LruCache<String, Bitmap>(24 * 1024 * 1024) {
        override fun sizeOf(key: String, value: Bitmap): Int = value.byteCount
    }
}

private suspend fun load(url: String): Bitmap? {
    ImageCache.cache.get(url)?.let { return it }
    return withContext(Dispatchers.IO) {
        try {
            ImageCache.client.newCall(Request.Builder().url(url).build()).execute().use { response ->
                val bytes = response.body?.bytes() ?: return@use null
                if (!response.isSuccessful) return@use null
                val bounds = BitmapFactory.Options().apply { inJustDecodeBounds = true }
                BitmapFactory.decodeByteArray(bytes, 0, bytes.size, bounds)
                var sample = 1
                while (bounds.outWidth / sample > 1600) sample *= 2
                val options = BitmapFactory.Options().apply { inSampleSize = sample }
                BitmapFactory.decodeByteArray(bytes, 0, bytes.size, options)
            }?.also { ImageCache.cache.put(url, it) }
        } catch (e: java.io.IOException) {
            null
        }
    }
}

@Composable
fun RemoteImage(id: String, modifier: Modifier = Modifier, contentScale: ContentScale = ContentScale.Crop) {
    val url = "${BuildConfig.API_BASE_URL.trimEnd('/')}/api/photos/$id"
    val bitmap by produceState<Bitmap?>(initialValue = null, url) { value = load(url) }
    val loaded = bitmap
    if (loaded != null) {
        Image(
            bitmap = loaded.asImageBitmap(),
            contentDescription = null,
            contentScale = contentScale,
            modifier = modifier,
        )
    } else {
        Box(modifier = modifier.background(MaterialTheme.colorScheme.surfaceVariant))
    }
}
