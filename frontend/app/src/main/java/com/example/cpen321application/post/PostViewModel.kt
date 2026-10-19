package com.example.cpen321application.post

import android.app.Application
import android.net.Uri
import android.provider.OpenableColumns
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateListOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue
import androidx.lifecycle.AndroidViewModel
import androidx.lifecycle.viewModelScope
import com.example.cpen321application.BuildConfig
import com.example.cpen321application.auth.SessionManager
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.Job
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import org.json.JSONArray
import org.json.JSONObject

class PostViewModel(app: Application) : AndroidViewModel(app) {
    private val api = PostApi(
        BuildConfig.API_BASE_URL.trimEnd('/') + "/api",
        SessionRequestAuth(SessionManager.get(app)),
    )
    private val addressSearch = AddressSearch(app)

    // Navigation: bottom tab, and the post open on the detail screen
    var tab by mutableStateOf(AppTab.POSTS)
    var selected by mutableStateOf<PostSummary?>(null)

    // List screen
    var mode by mutableStateOf(Mode.BUYING)
        private set
    var posts by mutableStateOf<List<PostSummary>>(emptyList())
        private set
    var loading by mutableStateOf(false)
        private set
    var message by mutableStateOf<String?>(null)

    // Editor
    var editing by mutableStateOf(false)
        private set
    var saving by mutableStateOf(false)
        private set
    /** Id of the post being edited, or null when creating. */
    var editingId by mutableStateOf<String?>(null)
        private set
    val existingPhotoIds = mutableStateListOf<String>()
    var addressSuggestions by mutableStateOf<List<AddressSuggestion>>(emptyList())
        private set
    // The address and coordinates of the suggestion the user chose (or the saved post's own).
    /** Set only after Save fails because the address was not picked; cleared on any edit. */
    var showAddressError by mutableStateOf(false)
        private set
    private var pickedAddress by mutableStateOf<String?>(null)
    private var pickedLocation by mutableStateOf<JSONObject?>(null)

    /** True only while the field still holds a chosen suggestion, unedited. */
    val addressConfirmed: Boolean
        get() = pickedLocation != null && address.trim() == pickedAddress
    private var suggestJob: Job? = null
    var category by mutableStateOf("")
    var address by mutableStateOf("")
    var description by mutableStateOf("")
    var price by mutableStateOf("")
    var condition by mutableStateOf("good")
    val photos = mutableStateListOf<Uri>()
    val rows = mutableStateListOf<RowState>()
    var categories by mutableStateOf<List<OptionItem>>(emptyList())
        private set
    var savedFields by mutableStateOf<List<FieldDef>>(emptyList())
        private set
    private val optionCache = mutableMapOf<String, List<OptionItem>>()

    init {
        refresh()
    }

    fun selectMode(newMode: Mode) {
        if (newMode == mode) return
        mode = newMode
        refresh()
    }

    fun refresh() {
        viewModelScope.launch { load() }
    }

    private suspend fun load() {
        loading = true
        try {
            posts = api.listPosts(mode)
        } catch (e: ApiException) {
            message = e.message
        } finally {
            loading = false
        }
    }

    fun toggleStatus(post: PostSummary) {
        viewModelScope.launch {
            try {
                val next = if (post.status == "open") "closed" else "open"
                api.setStatus(mode, post.id, next)
                selected = selected?.takeIf { it.id == post.id }?.copy(status = next)
                refresh()
            } catch (e: ApiException) {
                message = e.message
            }
        }
    }

    fun delete(post: PostSummary) {
        viewModelScope.launch {
            try {
                api.deletePost(mode, post.id)
                selected = null
                refresh()
            } catch (e: ApiException) {
                message = e.message
            }
        }
    }

    /** Opens the editor: blank for a new post, prefilled when [post] is given. */
    fun startEditing(post: PostSummary? = null) {
        category = ""
        address = ""
        description = ""
        price = ""
        condition = "good"
        photos.clear()
        existingPhotoIds.clear()
        addressSuggestions = emptyList()
        showAddressError = false
        pickedAddress = null
        pickedLocation = null
        rows.clear()
        rows.addAll(defaultRows(mode))
        editingId = post?.id
        if (post != null) prefill(post.raw)
        editing = true
        viewModelScope.launch {
            try {
                categories = api.options("category")
                savedFields = api.fields()
            } catch (e: ApiException) {
                message = e.message
            }
        }
    }

    private fun prefill(raw: JSONObject) {
        val seller = mode == Mode.SELLING
        category = raw.getString("category")
        address = raw.getString("address")
        description = raw.optString("description")
        if (seller) {
            price = raw.get("price").toString().removeSuffix(".0")
            condition = raw.getString("condition")
        }
        val coords = raw.getJSONObject("location").getJSONArray("coordinates")
        pickedAddress = address
        pickedLocation = JSONObject()
            .put("longitude", coords.getDouble(0))
            .put("latitude", coords.getDouble(1))
        raw.optJSONArray("photoIds")?.let { ids ->
            for (i in 0 until ids.length()) existingPhotoIds.add(ids.getString(i))
        }

        val stored = raw.optJSONArray(if (seller) "listingFields" else "requestFields") ?: return
        for (i in 0 until stored.length()) {
            val o = stored.getJSONObject(i)
            val type = o.getString("type")
            var row = RowState(
                key = o.getString("key"),
                label = o.getString("label"),
                kind = o.getString("kind"),
                type = type,
                hard = o.optBoolean("hard", false),
                importance = o.optInt("importance", 3),
            )
            row = when (type) {
                "bool" -> row.copy(boolValue = o.getBoolean("value"))
                "dimensions" -> {
                    val d = o.getJSONObject("value")
                    row.copy(
                        width = d.get("width").toString().removeSuffix(".0"),
                        height = d.get("height").toString().removeSuffix(".0"),
                        depth = d.get("depth").toString().removeSuffix(".0"),
                    )
                }
                else -> row.copy(value = o.get("value").toString().removeSuffix(".0"))
            }
            val at = rows.indexOfFirst { it.key == row.key }
            if (at >= 0) rows[at] = row.copy(required = rows[at].required) else rows.add(row)
        }
    }

    fun stopEditing() {
        editing = false
        addressSuggestions = emptyList()
    }

    /** Called on every address keystroke; suggests matching addresses after a short pause. */
    fun onAddressChange(text: String) {
        address = text
        showAddressError = false
        suggestJob?.cancel()
        if (text.trim().length < 3 || text.trim() == pickedAddress) {
            addressSuggestions = emptyList()
            return
        }
        suggestJob = viewModelScope.launch {
            delay(250)
            addressSuggestions = addressSearch.suggest(text.trim())
        }
    }

    fun pickAddress(suggestion: AddressSuggestion) {
        address = suggestion.label
        pickedAddress = suggestion.label
        showAddressError = false
        pickedLocation = JSONObject()
            .put("longitude", suggestion.longitude)
            .put("latitude", suggestion.latitude)
        addressSuggestions = emptyList()
    }

    fun updateRow(index: Int, row: RowState) {
        rows[index] = row
    }

    fun removeRow(index: Int) {
        rows.removeAt(index)
    }

    fun addCustomRow(label: String, type: String): String? {
        val trimmed = label.trim()
        if (trimmed.isEmpty()) return "Enter a field name"
        if (rows.count { it.isCustom } >= MAX_CUSTOM_FIELDS) {
            return "At most $MAX_CUSTOM_FIELDS custom fields"
        }
        val key = trimmed.lowercase().replace(Regex("\\s+"), " ")
        if (rows.any { it.key == key }) return "That field is already on this post"
        rows.add(RowState(key, trimmed, "custom", type, hard = false))
        return null
    }

    fun addPhotos(uris: List<Uri>) {
        val room = MAX_PHOTOS - photos.size - existingPhotoIds.size
        if (uris.size > room) message = "At most $MAX_PHOTOS photos"
        photos.addAll(uris.take(room))
    }

    fun removePhoto(index: Int) {
        photos.removeAt(index)
    }

    fun removeExistingPhoto(index: Int) {
        existingPhotoIds.removeAt(index)
    }

    /** Option suggestions for a field, cached per field. */
    suspend fun suggestions(field: String): List<OptionItem> {
        optionCache[field]?.let { return it }
        return try {
            api.options(field).also { optionCache[field] = it }
        } catch (e: ApiException) {
            emptyList()
        }
    }

    fun submit() {
        if (saving) return
        viewModelScope.launch {
            saving = true
            try {
                val body = buildBody()
                ensureOptions(body)
                val id = editingId
                if (id == null) api.createPost(mode, body) else api.updatePost(mode, id, body)
                optionCache.clear()
                editing = false
                load()
                // Keep the detail screen on the freshly saved post after an edit.
                selected = selected?.let { s -> posts.find { it.id == s.id } }
            } catch (e: ApiException) {
                message = e.message
            } finally {
                saving = false
            }
        }
    }

    private suspend fun buildBody(): JSONObject {
        val seller = mode == Mode.SELLING
        if (category.isBlank()) throw ApiException("Choose a category")
        val location = pickedLocation
        if (location == null || !addressConfirmed) {
            showAddressError = true
            throw ApiException("Choose your address from the suggestions list")
        }
        if (seller && photos.isEmpty() && existingPhotoIds.isEmpty()) {
            throw ApiException("Add at least one photo")
        }

        val body = JSONObject()
            .put("category", category.trim())
            .put("description", description.trim())
            .put("address", address.trim())
            .put("location", location)

        if (seller) {
            val parsedPrice = price.trim().toDoubleOrNull()
                ?: throw ApiException("Enter a price")
            body.put("price", parsedPrice).put("condition", condition)
        }

        val rowsJson = JSONArray()
        for (row in rows) {
            if (row.required && row.isEmpty) throw ApiException("${row.label} is required")
            if (row.isEmpty) continue
            rowsJson.put(rowToJson(row, seller))
        }
        body.put(if (seller) "listingFields" else "requestFields", rowsJson)

        val uploaded = if (photos.isNotEmpty()) api.uploadPhotos(readPhotos()) else emptyList()
        body.put("photoIds", JSONArray(existingPhotoIds + uploaded))
        return body
    }

    private fun rowToJson(row: RowState, seller: Boolean): JSONObject {
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

    /** New brand, colour, category and custom text values are added to the saved options first. */
    private suspend fun ensureOptions(body: JSONObject) {
        api.addOption("category", body.getString("category"))
        val rowsJson = body.optJSONArray("requestFields") ?: body.optJSONArray("listingFields") ?: return
        for (i in 0 until rowsJson.length()) {
            val row = rowsJson.getJSONObject(i)
            val key = row.optString("key")
            if (row.optString("kind") == "builtin" && (key == "brand" || key == "colour")) {
                api.addOption(key, row.getString("value"))
            }
        }
    }

    private suspend fun readPhotos(): List<PhotoData> = withContext(Dispatchers.IO) {
        val resolver = getApplication<Application>().contentResolver
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
}
