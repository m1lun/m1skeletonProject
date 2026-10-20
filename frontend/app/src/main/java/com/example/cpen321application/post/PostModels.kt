package com.example.cpen321application.post

import org.json.JSONObject

enum class Mode(val path: String, val tabLabel: String, val newLabel: String) {
    BUYING("requests", "I'm buying", "New request"),
    SELLING("listings", "I'm selling", "New listing"),
}

enum class AppTab(val label: String) {
    POSTS("My Posts"),
    PROFILE("Profile"),
}

val CONDITIONS = listOf("new", "like new", "good", "fair", "poor")

const val MAX_PHOTOS = 10
const val MAX_PHOTO_BYTES = 5 * 1024 * 1024
const val MAX_CUSTOM_FIELDS = 10

/** One line on the detail screen; hard/importance are set for request fields only. */
data class DetailRow(
    val label: String,
    val value: String,
    val hard: Boolean? = null,
    val importance: Int? = null,
)

data class PostDetail(
    val category: String,
    val address: String,
    val description: String,
    val price: String?,
    val condition: String?,
    val photoIds: List<String>,
    val rows: List<DetailRow>,
    val createdAt: String,
)

data class PostSummary(
    val id: String,
    val title: String,
    val subtitle: String,
    val status: String,
    val detail: PostDetail,
    /** The post exactly as the backend returned it; used to prefill the editor. */
    val raw: JSONObject,
)

data class AddressSuggestion(
    val label: String,
    val longitude: Double,
    val latitude: Double,
)

data class OptionItem(val key: String, val label: String)

data class FieldDef(val key: String, val label: String, val type: String)

fun String.titleCase(): String =
    split(' ').joinToString(" ") { word -> word.replaceFirstChar { it.uppercase() } }

/** One field of a listing or a request in the editor. */
data class RowState(
    val key: String,
    val label: String,
    val kind: String, // "builtin" | "custom"
    val type: String, // "text" | "number" | "bool" | "dimensions"
    val value: String = "",
    val width: String = "",
    val height: String = "",
    val depth: String = "",
    val boolValue: Boolean = false,
    val hard: Boolean = false,
    val importance: Int = 3,
    val required: Boolean = false,
) {
    val isCustom: Boolean get() = kind == "custom"

    /** Fields with saved options get suggestions from /options. */
    val optionField: String?
        get() = when {
            kind == "builtin" && (key == "brand" || key == "colour") -> key
            isCustom && type == "text" -> key
            else -> null
        }

    val isEmpty: Boolean
        get() = when (type) {
            "bool" -> false
            "dimensions" -> width.isBlank() && height.isBlank() && depth.isBlank()
            else -> value.isBlank()
        }
}

/** Default fields shown when creating a post. */
fun defaultRows(mode: Mode): List<RowState> = when (mode) {
    Mode.BUYING -> listOf(
        RowState("price", "Max price", "builtin", "number", required = true),
        RowState("condition", "Min condition", "builtin", "text"),
        RowState("dimensions", "Max size (cm)", "builtin", "dimensions"),
        RowState("radiuskm", "Radius (km)", "builtin", "number"),
        RowState("brand", "Brand", "builtin", "text"),
        RowState("colour", "Colour", "builtin", "text"),
    )
    Mode.SELLING -> listOf(
        RowState("brand", "Brand", "builtin", "text"),
        RowState("colour", "Colour", "builtin", "text"),
        RowState("dimensions", "Size (cm)", "builtin", "dimensions"),
    )
}
