package com.example.cpen321application.messages

import com.example.cpen321application.auth.SessionManager
import com.example.cpen321application.post.objects
import java.io.IOException
import java.net.URLEncoder
import org.json.JSONObject

class MessagesApi(private val sessions: SessionManager) {
    suspend fun conversations(): List<Conversation> =
        JSONObject(request("GET", "/api/conversations")).getJSONArray("conversations").objects().map(::parseConversation)

    // Newest first; `before` is the nextCursor of the previous page.
    suspend fun messages(conversationId: String, before: String?): MessagesPage {
        val query = before?.let { "?before=${URLEncoder.encode(it, "UTF-8")}" }.orEmpty()
        val json = JSONObject(request("GET", "/api/conversations/$conversationId/messages$query"))
        val nextCursor = if (json.isNull("nextCursor")) null else json.getString("nextCursor")
        return MessagesPage(json.getJSONArray("messages").objects().map(::parseMessage), nextCursor)
    }

    suspend fun send(conversationId: String, text: String): ChatMessage {
        val body = JSONObject().put("text", text)
        return parseMessage(JSONObject(request("POST", "/api/conversations/$conversationId/messages", body)))
    }

    // The body of a successful call; an error status is thrown as an IOException.
    private suspend fun request(method: String, path: String, body: JSONObject? = null): String {
        val result = sessions.authorizedRequest(method, path, body)
        if (!result.isSuccess) {
            throw IOException("HTTP ${result.code}: ${result.errorMessage}")
        }
        return result.body
    }
}

private fun parseConversation(json: JSONObject): Conversation {
    val user = json.getJSONObject("otherUser")
    return Conversation(
        id = json.getString("id"),
        otherUserId = user.getString("id"),
        otherUserName = "${user.optString("firstName")} ${user.optString("lastName")}".trim(),
        listing = json.optPost("listing"),
        request = json.optPost("request"),
        lastMessage = if (json.isNull("lastMessage")) null else json.getJSONObject("lastMessage").getString("text")
    )
}

private fun JSONObject.optPost(key: String): ConversationPost? {
    if (isNull(key)) return null
    val post = getJSONObject(key)
    return ConversationPost(post.getString("id"), post.getString("name"), post.getString("status") == "closed")
}

private fun parseMessage(json: JSONObject): ChatMessage =
    ChatMessage(id = json.getString("id"), senderId = json.getString("senderId"), text = json.getString("text"))
