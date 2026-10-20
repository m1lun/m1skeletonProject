package com.example.cpen321application.post

import android.content.Context
import android.location.Address
import android.location.Geocoder
import android.os.Build
import kotlinx.coroutines.suspendCancellableCoroutine
import kotlin.coroutines.resume

/* Address suggestions from the Android platform [Geocoder] */
class AddressSearch(private val context: Context) {
    suspend fun suggest(query: String): List<AddressSuggestion> =
        lookup(Geocoder(context), query)
            .mapNotNull { a ->
                a.getAddressLine(0)?.let { AddressSuggestion(it, a.longitude, a.latitude) }
            }
            .distinctBy { it.label.lowercase() }

    // The callback API needs Android 13; Pixel 9 and newer have it. Older versions get no suggestions.
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
            emptyList()
        }

    private companion object {
        const val MAX_RESULTS = 5
    }
}
