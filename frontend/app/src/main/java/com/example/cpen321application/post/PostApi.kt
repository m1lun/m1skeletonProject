package com.example.cpen321application.post

import com.example.cpen321application.auth.SessionExpiredException
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.MultipartBody
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.RequestBody
import okhttp3.RequestBody.Companion.toRequestBody
import org.json.JSONArray
import org.json.JSONObject

class ApiException(message: String) : Exception(message)

/** An image picked by the user, read into memory. */
class PhotoData(val name: String, val mimeType: String, val bytes: ByteArray)

class PostApi(
    baseUrl: String,
    private val auth: RequestAuth,
    private val client: OkHttpClient = OkHttpClient(),
) {
    private val base = baseUrl.trimEnd('/')
    private val json = "application/json".toMediaType()

    private suspend fun call(path: String, build: Request.Builder.() -> Unit = {}): String =
        withContext(Dispatchers.IO) {
            val builder = Request.Builder().url("$base$path")
            try {
                auth.headers().forEach { (name, value) -> builder.header(name, value) }
                builder.apply(build)
                client.newCall(builder.build()).execute().use { response ->
                    val body = response.body?.string().orEmpty()
                    if (!response.isSuccessful) throw ApiException(errorMessage(body, response.code))
                    body
                }
            } catch (e: SessionExpiredException) {
                throw ApiException("Your session has expired. Sign in again.")
            } catch (e: java.io.IOException) {
                throw ApiException("Could not reach the server. Check your connection.")
            }
        }

    private fun errorMessage(body: String, code: Int): String = try {
        val obj = JSONObject(body)
        val details = obj.optJSONArray("details")
        if (details != null && details.length() > 0) {
            (0 until details.length()).joinToString("\n") { details.getString(it) }
        } else {
            obj.optString("error", "Request failed ($code)")
        }
    } catch (e: org.json.JSONException) {
        "Request failed ($code)"
    }

    suspend fun listPosts(mode: Mode): List<PostSummary> {
        val array = JSONArray(call("/${mode.path}"))
        return (0 until array.length()).map { summarise(mode, array.getJSONObject(it)) }
    }

    private fun formatValue(row: JSONObject): String {
        val value = row.get("value")
        return when (row.getString("type")) {
            "dimensions" -> {
                val d = row.getJSONObject("value")
                "${d.get("width")} × ${d.get("height")} × ${d.get("depth")} cm"
            }
            "bool" -> if (row.getBoolean("value")) "Yes" else "No"
            "number" -> when (row.getString("key")) {
                "price" -> "$$value"
                "radiuskm" -> "$value km"
                else -> value.toString()
            }
            else -> value.toString().titleCase()
        }
    }

    private fun detailOf(mode: Mode, post: JSONObject): PostDetail {
        val rowsKey = if (mode == Mode.BUYING) "requestFields" else "listingFields"
        val rows = post.getJSONArray(rowsKey)
        val detailRows = (0 until rows.length()).map {
            val row = rows.getJSONObject(it)
            DetailRow(
                label = row.getString("label"),
                value = formatValue(row),
                hard = if (mode == Mode.BUYING) row.getBoolean("hard") else null,
                importance = if (row.has("importance")) row.getInt("importance") else null,
            )
        }
        val photos = post.optJSONArray("photoIds") ?: JSONArray()
        return PostDetail(
            category = post.getString("category").titleCase(),
            address = post.getString("address"),
            description = post.optString("description"),
            price = if (mode == Mode.SELLING) "$${post.get("price")}" else null,
            condition = if (mode == Mode.SELLING) post.getString("condition").titleCase() else null,
            photoIds = (0 until photos.length()).map { photos.getString(it) },
            rows = detailRows,
            createdAt = post.optString("createdAt").take(10),
        )
    }

    private fun summarise(mode: Mode, post: JSONObject): PostSummary {
        val category = post.getString("category").titleCase()
        val detail = detailOf(mode, post)
        return if (mode == Mode.BUYING) {
            val rows = post.getJSONArray("requestFields")
            var hard = 0
            var max = ""
            for (i in 0 until rows.length()) {
                val row = rows.getJSONObject(i)
                if (row.getBoolean("hard")) hard++
                if (row.getString("key") == "price") max = " · ≤ $${row.get("value")}"
            }
            PostSummary(
                post.getString("id"),
                category + max,
                "$hard hard · ${rows.length() - hard} soft",
                post.getString("status"),
                detail,
                post,
            )
        } else {
            PostSummary(
                post.getString("id"),
                "$category · $${post.get("price")}",
                post.getString("condition").titleCase(),
                post.getString("status"),
                detail,
                post,
            )
        }
    }

    suspend fun createPost(mode: Mode, body: JSONObject) {
        call("/${mode.path}") { post(body.toString().toRequestBody(json)) }
    }

    suspend fun updatePost(mode: Mode, id: String, body: JSONObject) {
        call("/${mode.path}/$id") { patch(body.toString().toRequestBody(json)) }
    }

    suspend fun setStatus(mode: Mode, id: String, status: String) {
        val body = JSONObject().put("status", status)
        call("/${mode.path}/$id") { patch(body.toString().toRequestBody(json)) }
    }

    suspend fun deletePost(mode: Mode, id: String) {
        call("/${mode.path}/$id") { delete() }
    }

    suspend fun options(field: String): List<OptionItem> {
        val encoded = java.net.URLEncoder.encode(field, "UTF-8")
        val array = JSONArray(call("/options?field=$encoded"))
        return (0 until array.length()).map {
            val o = array.getJSONObject(it)
            OptionItem(o.getString("key"), o.getString("label"))
        }
    }

    /** Adds an option; adding an existing one is harmless. */
    suspend fun addOption(field: String, label: String) {
        val body = JSONObject().put("field", field).put("label", label)
        call("/options") { post(body.toString().toRequestBody(json)) }
    }

    suspend fun fields(): List<FieldDef> {
        val array = JSONArray(call("/custom-fields"))
        return (0 until array.length()).map {
            val f = array.getJSONObject(it)
            FieldDef(f.getString("key"), f.getString("label"), f.getString("type"))
        }
    }

    suspend fun uploadPhotos(photos: List<PhotoData>): List<String> {
        val form = MultipartBody.Builder().setType(MultipartBody.FORM)
        photos.forEach {
            form.addFormDataPart(
                "photos",
                it.name,
                it.bytes.toRequestBody(it.mimeType.toMediaType()),
            )
        }
        val body: RequestBody = form.build()
        val array = JSONObject(call("/photos") { post(body) }).getJSONArray("ids")
        return (0 until array.length()).map { array.getString(it) }
    }
}
