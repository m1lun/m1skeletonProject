package com.example.cpen321application.support

enum class PostForm(
    val mode: String,
    val newButton: String,
    val createButton: String,
    val listHeader: String,
    val editTitle: String,
    val missingPriceError: String,
    val negativePriceError: String,
    val photoRequired: Boolean,
) {
    REQUEST("I'm buying", "New request", "Create request", "My requests (", "Edit request", "Max price is required", "at least 0", false),
    LISTING("I'm selling", "New listing", "Create listing", "My listings (", "Edit listing", "Enter a price", "price must be", true),
}
