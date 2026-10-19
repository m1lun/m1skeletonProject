package com.example.cpen321application.post

import android.content.ContentResolver
import android.net.Uri
import android.provider.OpenableColumns
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import org.json.JSONObject

internal fun rowToJson(row: RowState, seller: Boolean): JSONObject {
    val json = JSONObject().put("kind", row.kind)
    if (row.isCustom) json.put("label", row.label).put("type", row.type) else json.put("key", row.key)
    when (row.type) {
        "number" -> json.put(
            "value",
            row.value.trim().toDoubleOrNull() ?: throw ApiException("${row.label} must be a number"),
        )
        "bool" -> json.put("value", row.boolValue)
        "dimensions" -> {
            val dims = listOf(row.width, row.height, row.depth).map { it.trim().toDoubleOrNull() }
            if (dims.any { it == null }) throw ApiException("${row.label}: fill width, height and depth")
            json.put(
                "value",
                JSONObject().put("width", dims[0]).put("height", dims[1]).put("depth", dims[2]),
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
            if (bytes.size > MAX_PHOTO_BYTES) throw ApiException("Each photo must be at most 10 MB")
            val mime = resolver.getType(uri) ?: "image/jpeg"
            var name = "photo"
            resolver.query(uri, null, null, null, null)?.use { c ->
                val col = c.getColumnIndex(OpenableColumns.DISPLAY_NAME)
                if (col >= 0 && c.moveToFirst()) name = c.getString(col)
            }
            PhotoData(name, mime, bytes)
        }
    }
