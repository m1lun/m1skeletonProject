package com.example.cpen321application.post

import android.content.ContentResolver
import android.net.Uri
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import org.json.JSONObject

private const val BYTES_PER_MB = 1024 * 1024

private fun String.toNumber(error: String): Double = trim().toDoubleOrNull() ?: throw ApiException(error)

internal fun rowToJson(row: RowState, seller: Boolean): JSONObject {
    val json = JSONObject().put("kind", row.kind)
    if (row.isCustom) json.put("label", row.label).put("type", row.type) else json.put("key", row.key)
    when (row.type) {
        "number" -> json.put("value", row.value.toNumber("${row.label} must be a number"))
        "bool" -> json.put("value", row.boolValue)
        "dimensions" -> {
            val error = "${row.label}: fill width, height and depth"
            json.put(
                "value",
                JSONObject()
                    .put("width", row.width.toNumber(error))
                    .put("height", row.height.toNumber(error))
                    .put("depth", row.depth.toNumber(error)),
            )
        }
        else -> json.put("value", row.value.trim())
    }
    if (!seller) {
        json.put("hard", row.hard)
        if (!row.hard) json.put("importance", row.importance)
    }
    return json
}

internal suspend fun readPhotos(resolver: ContentResolver, photos: List<Uri>): List<PhotoData> =
    withContext(Dispatchers.IO) {
        photos.map { uri ->
            val bytes = resolver.openInputStream(uri)?.use { it.readBytes() }
                ?: throw ApiException("Could not read a selected photo")
            if (bytes.size > MAX_PHOTO_BYTES) throw ApiException("Each photo must be at most ${MAX_PHOTO_BYTES / BYTES_PER_MB} MB")
            val mime = resolver.getType(uri) ?: throw ApiException("One of your photos can't be used. Please remove it and choose a different one.")
            PhotoData(mime, bytes)
        }
    }
