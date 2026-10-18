package com.example.cpen321application.remote.data.response

import java.util.Date

data class SellingListingDto (
    val itemName: String,
    val itemPrice: Float,
    val listingDate: Date,
    val sellerName: String,
    val itemImageURL: String,

)