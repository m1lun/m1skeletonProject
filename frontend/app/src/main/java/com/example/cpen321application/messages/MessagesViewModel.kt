package com.example.cpen321application.messages

import android.app.Application
import android.util.Log
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue
import androidx.lifecycle.AndroidViewModel
import androidx.lifecycle.viewModelScope
import com.example.cpen321application.auth.SessionExpiredException
import com.example.cpen321application.auth.SessionManager
import java.io.IOException
import kotlinx.coroutines.Job
import kotlinx.coroutines.launch
import org.json.JSONException

private const val TAG = "MessagesViewModel"

data class InboxState(
    val conversations: List<Conversation> = emptyList(),
    val isLoading: Boolean = false,
    val loadFailed: Boolean = false
)

// Messages are newest first, as the backend pages them; the screen shows them bottom-up.
data class ChatState(
    val conversation: Conversation,
    val messages: List<ChatMessage> = emptyList(),
    val nextCursor: String? = null,
    val isLoading: Boolean = false,
    val loadFailed: Boolean = false,
    val isSending: Boolean = false,
    val sendFailed: Boolean = false
)

class MessagesViewModel(app: Application) : AndroidViewModel(app) {
    private val api = MessagesApi(SessionManager.get(app))
    private var chatJob: Job? = null

    var inbox by mutableStateOf(InboxState())
        private set
    var chat by mutableStateOf<ChatState?>(null)
        private set
    var signedOut by mutableStateOf(false)
        private set

    fun refreshInbox() {
        viewModelScope.launch {
            inbox = inbox.copy(isLoading = true, loadFailed = false)
            val conversations = call("load conversations") { api.conversations() }
            inbox = if (conversations == null) inbox.copy(isLoading = false, loadFailed = true) else InboxState(conversations)
        }
    }

    fun openChat(conversation: Conversation) {
        chat = ChatState(conversation)
        refreshChat()
    }

    fun closeChat() {
        chatJob?.cancel()
        chat = null
    }

    fun refreshChat() = loadMessages(before = null)

    fun loadEarlier() {
        chat?.nextCursor?.let { loadMessages(before = it) }
    }

    // onSent clears the text box, so a message that failed to send stays there to try again.
    fun send(text: String, onSent: () -> Unit) {
        val current = chat ?: return
        if (current.isSending) return
        val id = current.conversation.id
        viewModelScope.launch {
            updateChat(id) { it.copy(isSending = true, sendFailed = false) }
            val message = call("send message") { api.send(id, text.trim()) }
            updateChat(id) { it.copy(messages = listOfNotNull(message) + it.messages, isSending = false, sendFailed = message == null) }
            if (message != null) onSent()
        }
    }

    // A refresh (before = null) replaces the messages; an earlier page is added after the oldest.
    private fun loadMessages(before: String?) {
        val id = chat?.conversation?.id ?: return
        chatJob?.cancel()
        chatJob = viewModelScope.launch {
            updateChat(id) { it.copy(isLoading = true, loadFailed = false) }
            val page = call("load messages") { api.messages(id, before) }
            updateChat(id) {
                when {
                    page == null -> it.copy(isLoading = false, loadFailed = true)
                    before == null -> it.copy(messages = page.messages, nextCursor = page.nextCursor, isLoading = false)
                    else -> it.copy(messages = it.messages + page.messages, nextCursor = page.nextCursor, isLoading = false)
                }
            }
        }
    }

    // Skips the update if the user has left this chat meanwhile.
    private fun updateChat(id: String, change: (ChatState) -> ChatState) {
        chat?.takeIf { it.conversation.id == id }?.let { chat = change(it) }
    }

    // Runs a backend call; null when it failed, which is logged, or when the session is gone.
    private suspend fun <T> call(what: String, block: suspend () -> T): T? = try {
        block()
    } catch (_: SessionExpiredException) {
        signedOut = true
        null
    } catch (e: IOException) {
        Log.w(TAG, "Could not $what", e)
        null
    } catch (e: JSONException) {
        Log.w(TAG, "Unexpected response: $what", e)
        null
    }
}
