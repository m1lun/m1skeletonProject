package com.example.cpen321application.post

import android.content.Context
import android.location.Geocoder
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext

/** Address suggestions from the Android platform [Geocoder]; no extra services or keys. */
class AddressSearch(private val context: Context) {
    suspend fun suggest(query: String): List<AddressSuggestion> = withContext(Dispatchers.IO) {
        try {
            @Suppress("DEPRECATION")
            Geocoder(context).getFromLocationName(query, MAX_RESULTS)
                .orEmpty()
                .mapNotNull { a ->
                    a.getAddressLine(0)?.let { AddressSuggestion(it, a.longitude, a.latitude) }
                }
                .distinctBy { it.label.lowercase() }
        } catch (e: java.io.IOException) {
            emptyList()
        }
    }

    private companion object {
        const val MAX_RESULTS = 5
    }
}
