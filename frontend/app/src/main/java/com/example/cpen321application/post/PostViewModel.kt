package com.example.cpen321application.post

import android.app.Application
import android.net.Uri
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateListOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue
import androidx.lifecycle.AndroidViewModel
import androidx.lifecycle.viewModelScope
import com.example.cpen321application.BuildConfig
import com.example.cpen321application.auth.SessionManager
import kotlinx.coroutines.Job
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch
import org.json.JSONArray
import org.json.JSONObject

class PostViewModel(app: Application) : AndroidViewModel(app) {
    private val api = PostApi(
        BuildConfig.API_BASE_URL.trimEnd('/') + "/api",
        SessionRequestAuth(SessionManager.get(app)),
    )
    private val addressSearch = AddressSearch(app)

    var tab by mutableStateOf(AppTab.POSTS)
    var selected by mutableStateOf<PostSummary?>(null)

    var mode by mutableStateOf(Mode.BUYING)
        private set
    var posts by mutableStateOf<List<PostSummary>>(emptyList())
        private set
    var loading by mutableStateOf(false)
        private set
    var message by mutableStateOf<String?>(null)

    var editing by mutableStateOf(false)
        private set
    var saving by mutableStateOf(false)
        private set
    var editingId by mutableStateOf<String?>(null)
        private set
    val existingPhotoIds = mutableStateListOf<String>()
    var addressSuggestions by mutableStateOf<List<AddressSuggestion>>(emptyList())
        private set
    var showAddressError by mutableStateOf(false)
        private set
    private var pickedAddress by mutableStateOf<String?>(null)
    private var pickedLocation by mutableStateOf<JSONObject?>(null)

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

    /** Set by "See recommendations"; MainActivity hands it to the Feed tab and clears it. */
    var recommendationsFor by mutableStateOf<PostSummary?>(null)

    fun showRecommendations(post: PostSummary) {
        recommendationsFor = post
        selected = null
        tab = AppTab.FEED
    }

    /** Another user's post opened from the Feed, shown read-only; null when none is open. */
    var openPost by mutableStateOf<PostSummary?>(null)
        private set
    /** Whether openPost is a request or a listing. */
    var openPostMode by mutableStateOf(Mode.SELLING)
        private set

    fun open(raw: JSONObject, postMode: Mode) {
        openPostMode = postMode
        openPost = api.summarise(postMode, raw)
    }

    fun closeOpenPost() {
        openPost = null
    }

    fun toggleStatus(post: PostSummary) {
        launchCatching {
            val next = if (post.status == "open") "closed" else "open"
            api.setStatus(mode, post.id, next)
            selected = selected?.takeIf { it.id == post.id }?.copy(status = next)
            refresh()
        }
    }

    fun delete(post: PostSummary) {
        launchCatching {
            api.deletePost(mode, post.id)
            selected = null
            refresh()
        }
    }

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
        launchCatching {
            categories = api.options("category")
            savedFields = api.fields()
        }
    }

    private fun prefill(raw: JSONObject) {
        val seller = mode == Mode.SELLING
        category = raw.getString("category")
        address = raw.getString("address")
        description = raw.optString("description")
        if (seller) {
            price = raw.get("price").asPlainNumber()
            condition = raw.getString("condition")
        }
        val coords = raw.getJSONObject("location").getJSONArray("coordinates")
        pickedAddress = address
        pickedLocation = locationJson(coords.getDouble(0), coords.getDouble(1))
        raw.optJSONArray("photoIds")?.let { existingPhotoIds.addAll(it.strings()) }

        val stored = raw.optJSONArray(if (seller) "listingFields" else "requestFields") ?: return
        for (o in stored.objects()) {
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
                        width = d.get("width").asPlainNumber(),
                        height = d.get("height").asPlainNumber(),
                        depth = d.get("depth").asPlainNumber(),
                    )
                }
                else -> row.copy(value = o.get("value").asPlainNumber())
            }
            val at = rows.indexOfFirst { it.key == row.key }
            if (at >= 0) rows[at] = row.copy(required = rows[at].required) else rows.add(row)
        }
    }

    fun stopEditing() {
        editing = false
        addressSuggestions = emptyList()
    }

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
        pickedLocation = locationJson(suggestion.longitude, suggestion.latitude)
        addressSuggestions = emptyList()
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
                val id = editingId
                if (id == null) api.createPost(mode, body) else api.updatePost(mode, id, body)
                optionCache.clear()
                editing = false
                load()
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

        val resolver = getApplication<Application>().contentResolver
        val uploaded = if (photos.isNotEmpty()) api.uploadPhotos(readPhotos(resolver, photos)) else emptyList()
        body.put("photoIds", JSONArray(existingPhotoIds + uploaded))
        return body
    }
}

private fun PostViewModel.launchCatching(block: suspend () -> Unit) {
    viewModelScope.launch {
        try {
            block()
        } catch (e: ApiException) {
            message = e.message
        }
    }
}

private fun locationJson(longitude: Double, latitude: Double) =
    JSONObject().put("longitude", longitude).put("latitude", latitude)

private fun Any.asPlainNumber() = toString().removeSuffix(".0")
