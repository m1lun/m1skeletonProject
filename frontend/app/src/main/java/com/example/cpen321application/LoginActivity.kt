package com.example.cpen321application

import android.content.Context
import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.activity.enableEdgeToEdge
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.credentials.CredentialManager
import androidx.credentials.GetCredentialRequest
import androidx.credentials.exceptions.GetCredentialCancellationException
import androidx.credentials.exceptions.GetCredentialException
import com.example.cpen321application.ui.theme.CPEN321ApplicationTheme
import com.google.android.libraries.identity.googleid.GetGoogleIdOption
import com.google.android.libraries.identity.googleid.GoogleIdTokenCredential
import java.net.HttpURLConnection
import java.net.Inet4Address
import java.net.NetworkInterface
import java.net.URL
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale
import java.util.TimeZone
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import org.json.JSONObject

const val PREFS_NAME = "cpen321_prefs"
const val PREF_SIGNED_IN_NAME = "signed_in_name"

data class ServerInfo(
    val serverIp: String,
    val serverTime: String,
    val developerName: String
)

class LoginActivity : ComponentActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        enableEdgeToEdge()
        setContent {
            CPEN321ApplicationTheme {
                Scaffold(modifier = Modifier.fillMaxSize()) { innerPadding ->
                    LoginScreen(
                        apiBaseUrl = BuildConfig.API_BASE_URL,
                        googleClientId = BuildConfig.GOOGLE_CLIENT_ID,
                        modifier = Modifier.padding(innerPadding)
                    )
                }
            }
        }
    }
}

@Composable
fun LoginScreen(apiBaseUrl: String, googleClientId: String, modifier: Modifier = Modifier) {
    var userDisplayName by remember { mutableStateOf<String?>(null) }
    var userEmail by remember { mutableStateOf<String?>(null) }
    var serverInfo by remember { mutableStateOf<ServerInfo?>(null) }
    var clientIp by remember { mutableStateOf("Loading…") }
    var clientTime by remember { mutableStateOf("Loading…") }
    var isLoading by remember { mutableStateOf(false) }
    var errorMessage by remember { mutableStateOf<String?>(null) }

    val context = LocalContext.current
    val activity = context as? ComponentActivity
    val scope = rememberCoroutineScope()

    LaunchedEffect(Unit) {
        clientIp = withContext(Dispatchers.IO) { getClientIp() }
        clientTime = getClientTime()
    }

    if (userDisplayName == null) {
        SignInScreen(
            isLoading = isLoading,
            errorMessage = errorMessage,
            onSignIn = {
                isLoading = true
                errorMessage = null
                scope.launch {
                    try {
                        val credentialManager = CredentialManager.create(context)
                        val googleIdOption = GetGoogleIdOption.Builder()
                            .setFilterByAuthorizedAccounts(false)
                            .setServerClientId(googleClientId)
                            .setAutoSelectEnabled(false)
                            .build()
                        val request = GetCredentialRequest.Builder()
                            .addCredentialOption(googleIdOption)
                            .build()
                        val result = credentialManager.getCredential(context, request)
                        val credential = result.credential
                        if (credential.type == GoogleIdTokenCredential.TYPE_GOOGLE_ID_TOKEN_CREDENTIAL) {
                            val googleCred = GoogleIdTokenCredential.createFrom(credential.data)
                            val name = googleCred.displayName ?: "Unknown"
                            userDisplayName = name
                            userEmail = googleCred.id
                            serverInfo = fetchServerInfo(apiBaseUrl)
                            context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
                                .edit().putString(PREF_SIGNED_IN_NAME, name).apply()
                        }
                    } catch (_: GetCredentialCancellationException) {
                    } catch (e: GetCredentialException) {
                        android.util.Log.e("LoginActivity", "Sign-in failed: ${e::class.simpleName} — ${e.message}")
                        errorMessage = "${e::class.simpleName}: ${e.message}"
                    } finally {
                        isLoading = false
                    }
                }
            },
            modifier = modifier
        )
    } else {
        InfoScreen(
            userDisplayName = userDisplayName ?: "",
            userEmail = userEmail ?: "",
            serverInfo = serverInfo,
            clientIp = clientIp,
            clientTime = clientTime,
            onSignOut = {
                context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
                    .edit().remove(PREF_SIGNED_IN_NAME).apply()
                activity?.finish()
            },
            modifier = modifier
        )
    }
}

@Composable
private fun SignInScreen(
    isLoading: Boolean,
    errorMessage: String?,
    onSignIn: () -> Unit,
    modifier: Modifier = Modifier
) {
    Column(
        modifier = modifier
            .fillMaxSize()
            .padding(32.dp),
        verticalArrangement = Arrangement.Center,
        horizontalAlignment = Alignment.CenterHorizontally
    ) {
        Text(
            text = "Welcome",
            fontSize = 32.sp,
            fontWeight = FontWeight.Bold,
            modifier = Modifier.padding(bottom = 8.dp)
        )
        Text(
            text = "Sign in to view server and client info",
            style = MaterialTheme.typography.bodyLarge,
            textAlign = TextAlign.Center,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
            modifier = Modifier.padding(bottom = 48.dp)
        )

        if (isLoading) {
            CircularProgressIndicator()
        } else {
            OutlinedButton(
                onClick = onSignIn,
                modifier = Modifier
                    .fillMaxWidth()
                    .height(50.dp)
            ) {
                Text(
                    text = "Sign in with Google",
                    fontWeight = FontWeight.Medium,
                    fontSize = 16.sp
                )
            }
        }

        if (errorMessage != null) {
            Text(
                text = errorMessage,
                color = MaterialTheme.colorScheme.error,
                style = MaterialTheme.typography.bodySmall,
                textAlign = TextAlign.Center,
                modifier = Modifier.padding(top = 16.dp)
            )
        }
    }
}

@Composable
private fun InfoScreen(
    userDisplayName: String,
    userEmail: String,
    serverInfo: ServerInfo?,
    clientIp: String,
    clientTime: String,
    onSignOut: () -> Unit,
    modifier: Modifier = Modifier
) {
    Column(
        modifier = modifier
            .fillMaxSize()
            .verticalScroll(rememberScrollState())
            .padding(24.dp),
        horizontalAlignment = Alignment.CenterHorizontally
    ) {
        Spacer(modifier = Modifier.height(16.dp))

        UserAvatar(name = userDisplayName)

        Spacer(modifier = Modifier.height(12.dp))

        Text(
            text = userDisplayName,
            fontSize = 20.sp,
            fontWeight = FontWeight.SemiBold
        )
        Text(
            text = userEmail,
            style = MaterialTheme.typography.bodyMedium,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
            modifier = Modifier.padding(bottom = 24.dp)
        )

        InfoCard(
            title = "SERVER",
            items = listOf(
                "Server public IP address" to (serverInfo?.serverIp ?: "Loading…"),
                "Server local time" to (serverInfo?.serverTime ?: "Loading…"),
                "Developer name" to (serverInfo?.developerName ?: "Loading…")
            )
        )

        Spacer(modifier = Modifier.height(16.dp))

        InfoCard(
            title = "CLIENT & USER",
            items = listOf(
                "Client IP address" to clientIp,
                "Client local time" to clientTime,
                "Logged-in user name" to userDisplayName
            )
        )

        Spacer(modifier = Modifier.height(24.dp))

        OutlinedButton(
            onClick = onSignOut,
            modifier = Modifier.fillMaxWidth()
        ) {
            Text(text = "Sign Out")
        }
    }
}

@Composable
private fun UserAvatar(name: String) {
    val initials = name.split(" ")
        .take(2)
        .mapNotNull { it.firstOrNull() }
        .joinToString("")
        .uppercase()

    Box(
        contentAlignment = Alignment.Center,
        modifier = Modifier
            .size(72.dp)
            .clip(CircleShape)
            .background(MaterialTheme.colorScheme.primary)
    ) {
        Text(
            text = initials,
            color = MaterialTheme.colorScheme.onPrimary,
            fontSize = 26.sp,
            fontWeight = FontWeight.Bold
        )
    }
}

@Composable
private fun InfoCard(title: String, items: List<Pair<String, String>>) {
    Card(
        modifier = Modifier.fillMaxWidth(),
        elevation = CardDefaults.cardElevation(defaultElevation = 2.dp)
    ) {
        Column(modifier = Modifier.padding(16.dp)) {
            Text(
                text = title,
                style = MaterialTheme.typography.labelLarge,
                color = MaterialTheme.colorScheme.primary,
                fontWeight = FontWeight.Bold,
                modifier = Modifier.padding(bottom = 12.dp)
            )
            items.forEachIndexed { index, (label, value) ->
                InfoRow(label = label, value = value)
                if (index < items.lastIndex) {
                    HorizontalDivider(modifier = Modifier.padding(vertical = 4.dp))
                }
            }
        }
    }
}

@Composable
private fun InfoRow(label: String, value: String) {
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .padding(vertical = 6.dp),
        horizontalArrangement = Arrangement.SpaceBetween,
        verticalAlignment = Alignment.CenterVertically
    ) {
        Text(
            text = label,
            style = MaterialTheme.typography.bodyMedium,
            color = MaterialTheme.colorScheme.onSurfaceVariant
        )
        Text(
            text = value,
            style = MaterialTheme.typography.bodyMedium,
            fontWeight = FontWeight.Medium,
            textAlign = TextAlign.End,
            modifier = Modifier
                .weight(1f, fill = false)
                .padding(start = 16.dp)
        )
    }
}

private fun getClientIp(): String {
    return try {
        NetworkInterface.getNetworkInterfaces()
            ?.toList()
            ?.filter { !it.isLoopback && it.isUp }
            ?.flatMap { it.inetAddresses.toList() }
            ?.filterIsInstance<Inet4Address>()
            ?.filterNot { it.isLoopbackAddress }
            ?.firstOrNull()?.hostAddress ?: "Unknown"
    } catch (_: Exception) {
        "Unknown"
    }
}

private fun getClientTime(): String {
    val now = Date()
    val tz = TimeZone.getDefault()
    val offset = tz.getOffset(now.time) / (1000 * 60)
    val sign = if (offset >= 0) "+" else "-"
    val absOffset = Math.abs(offset)
    val hours = absOffset / 60
    val mins = absOffset % 60
    val sdf = SimpleDateFormat("HH:mm:ss", Locale.getDefault())
    return "${sdf.format(now)} GMT${sign}${hours.toString().padStart(2, '0')}:${mins.toString().padStart(2, '0')}"
}

private suspend fun fetchServerInfo(apiBaseUrl: String): ServerInfo = withContext(Dispatchers.IO) {
    val base = apiBaseUrl.trimEnd('/')

    fun get(path: String): JSONObject? = try {
        val conn = (URL("$base/$path").openConnection() as HttpURLConnection).apply {
            requestMethod = "GET"
            connectTimeout = 5_000
            readTimeout = 5_000
        }
        if (conn.responseCode == HttpURLConnection.HTTP_OK) {
            JSONObject(conn.inputStream.bufferedReader().use { it.readText() })
        } else null
    } catch (_: Exception) { null }

    ServerInfo(
        serverIp = get("ip")?.optString("ip", "Unavailable") ?: "Unavailable",
        serverTime = get("time")?.optString("time", "Unavailable") ?: "Unavailable",
        developerName = get("name")?.let {
            "${it.optString("firstName", "")} ${it.optString("lastName", "")}".trim()
        } ?: "Unavailable"
    )
}
