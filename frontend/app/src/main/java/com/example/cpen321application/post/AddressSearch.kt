package com.example.cpen321application.post

import android.content.Context
import android.location.Address
import android.location.Geocoder
import android.os.Build
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.suspendCancellableCoroutine
import kotlinx.coroutines.withContext
import kotlin.coroutines.resume

/** Address suggestions from the Android platform [Geocoder]; no extra services or keys. */
class AddressSearch(private val context: Context) {
    suspend fun suggest(query: String): List<AddressSuggestion> =
        try {
            lookup(Geocoder(context), query)
                .mapNotNull { a ->
                    a.getAddressLine(0)?.let { AddressSuggestion(it, a.longitude, a.latitude) }
                }
                .distinctBy { it.label.lowercase() }
        } catch (e: java.io.IOException) {
            emptyList()
        }

    // Android 13 added a callback API and deprecated the blocking one.
    private suspend fun lookup(geocoder: Geocoder, query: String): List<Address> =
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
            suspendCancellableCoroutine { continuation ->
                geocoder.getFromLocationName(
                    query,
                    MAX_RESULTS,
                    object : Geocoder.GeocodeListener {
                        override fun onGeocode(addresses: MutableList<Address>) = continuation.resume(addresses)

                        override fun onError(errorMessage: String?) = continuation.resume(emptyList())
                    },
                )
            }
        } else {
            withContext(Dispatchers.IO) { geocoder.getFromLocationName(query, MAX_RESULTS).orEmpty() }
        }

    private companion object {
        const val MAX_RESULTS = 5
    }
}
