package com.example.cpen321application.post

import com.example.cpen321application.auth.SessionExpiredException
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.MultipartBody
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.RequestBody.Companion.toRequestBody
import org.json.JSONArray
import org.json.JSONObject

class ApiException(message: String) : Exception(message)

/** An image picked by the user, read into memory. */
class PhotoData(val mimeType: String, val bytes: ByteArray)

private const val PHOTO_FILE_NAME = "photo"

private fun JSONArray.objects(): List<JSONObject> = (0 until length()).map { getJSONObject(it) }

private fun JSONArray.strings(): List<String> = (0 until length()).map { getString(it) }

class PostApi(
    baseUrl: String,
    private val auth: RequestAuth,
    private val client: OkHttpClient = OkHttpClient(),
) {
    private val base = baseUrl.trimEnd('/')
    private val json = "application/json".toMediaType()

    private fun JSONObject.asBody() = toString().toRequestBody(json)

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
            details.strings().joinToString("\n")
        } else {
            obj.optString("error", "Request failed ($code)")
        }
    } catch (e: org.json.JSONException) {
        "Request failed ($code)"
    }

    suspend fun listPosts(mode: Mode): List<PostSummary> {
        return JSONArray(call("/${mode.path}")).objects().map { summarise(mode, it) }
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
        val detailRows = post.getJSONArray(rowsKey).objects().map { row ->
            DetailRow(
                label = row.getString("label"),
                value = formatValue(row),
                hard = if (mode == Mode.BUYING) row.getBoolean("hard") else null,
                importance = if (row.has("importance")) row.getInt("importance") else null,
            )
        }
        return PostDetail(
            category = post.getString("category").titleCase(),
            address = post.getString("address"),
            description = post.optString("description"),
            price = if (mode == Mode.SELLING) "$${post.get("price")}" else null,
            condition = if (mode == Mode.SELLING) post.getString("condition").titleCase() else null,
            photoIds = post.optJSONArray("photoIds")?.strings().orEmpty(),
            rows = detailRows,
            createdAt = post.optString("createdAt").take(10),
        )
    }

    private fun summarise(mode: Mode, post: JSONObject): PostSummary {
        val category = post.getString("category").titleCase()
        val detail = detailOf(mode, post)
        return if (mode == Mode.BUYING) {
            val rows = post.getJSONArray("requestFields").objects()
            val hard = rows.count { it.getBoolean("hard") }
            val max = rows.lastOrNull { it.getString("key") == "price" }?.let { " · ≤ $${it.get("value")}" }.orEmpty()
            PostSummary(
                post.getString("id"),
                category + max,
                "$hard hard · ${rows.size - hard} soft",
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
        call("/${mode.path}") { post(body.asBody()) }
    }

    suspend fun updatePost(mode: Mode, id: String, body: JSONObject) {
        call("/${mode.path}/$id") { patch(body.asBody()) }
    }

    suspend fun setStatus(mode: Mode, id: String, status: String) {
        updatePost(mode, id, JSONObject().put("status", status))
    }

    suspend fun deletePost(mode: Mode, id: String) {
        call("/${mode.path}/$id") { delete() }
    }

    suspend fun options(field: String): List<OptionItem> {
        val encoded = java.net.URLEncoder.encode(field, "UTF-8")
        return JSONArray(call("/options?field=$encoded")).objects().map {
            OptionItem(it.getString("key"), it.getString("label"))
        }
    }

    suspend fun fields(): List<FieldDef> {
        return JSONArray(call("/custom-fields")).objects().map {
            FieldDef(it.getString("key"), it.getString("label"), it.getString("type"))
        }
    }

    suspend fun uploadPhotos(photos: List<PhotoData>): List<String> {
        val form = MultipartBody.Builder().setType(MultipartBody.FORM)
        photos.forEach {
            form.addFormDataPart(
                "photos",
                PHOTO_FILE_NAME,
                it.bytes.toRequestBody(it.mimeType.toMediaType()),
            )
        }
        val body = form.build()
        return JSONObject(call("/photos") { post(body) }).getJSONArray("ids").strings()
    }
}
