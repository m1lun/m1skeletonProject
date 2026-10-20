package com.example.cpen321application.support

enum class PostForm(
    val mode: String,
    val newButton: String,
    val createButton: String,
    val listHeader: String,
    val missingPriceError: String,
    val negativePriceError: String,
    val missingPhotoError: String?,
) {
    REQUEST("I'm buying", "New request", "Create request", "My requests (", "Max price is required", "at least 0", null),
    LISTING("I'm selling", "New listing", "Create listing", "My listings (", "Enter a price", "price must be", "Add at least one photo"),
    ;

    val photoRequired: Boolean get() = missingPhotoError != null
}
