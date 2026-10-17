package com.example.cpen321application

import android.content.Context
import android.content.Intent
import android.os.Bundle
import android.provider.Settings
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.activity.enableEdgeToEdge
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.credentials.CredentialManager
import androidx.credentials.GetCredentialRequest
import androidx.credentials.exceptions.GetCredentialCancellationException
import androidx.credentials.exceptions.GetCredentialException
import androidx.credentials.exceptions.NoCredentialException
import com.example.cpen321application.ui.theme.CPEN321ApplicationTheme
import com.google.android.libraries.identity.googleid.GetSignInWithGoogleOption
import com.google.android.libraries.identity.googleid.GoogleIdTokenCredential
import com.google.android.libraries.identity.googleid.GoogleIdTokenParsingException
import java.io.IOException
import java.net.HttpURLConnection
import java.net.URL
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import org.json.JSONException
import org.json.JSONObject

const val PREFS_NAME = "cpen321_prefs"
const val PREF_SIGNED_IN_NAME = "signed_in_name"

private const val TAG = "LoginActivity"
private const val HTTP_TIMEOUT_MS = 5_000
private const val MAX_ERROR_CHARS = 200

// The signed-in account as the backend verified it from the ID token.
data class VerifiedUser(
    val firstName: String,
    val lastName: String,
    val email: String
) {
    // Full name, or the email when the account has no name on it.
    val displayName: String
        get() = "$firstName $lastName".trim().ifEmpty { email }
}

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

// What the sign-in screen shows while no one is signed in.
private data class SignInUiState(
    val isLoading: Boolean = false,
    val errorMessage: String? = null,
    val needsAccount: Boolean = false
)

// The outcome of one tap on "Sign in with Google".
private sealed interface SignInResult {
    data class Success(val user: VerifiedUser) : SignInResult
    data object Cancelled : SignInResult
    data object NoAccount : SignInResult
    data class Failure(val message: String) : SignInResult
}

@Composable
fun LoginScreen(apiBaseUrl: String, googleClientId: String, modifier: Modifier = Modifier) {
    var user by remember { mutableStateOf<VerifiedUser?>(null) }
    var uiState by remember { mutableStateOf(SignInUiState()) }

    val context = LocalContext.current
    val activity = context as? ComponentActivity
    val scope = rememberCoroutineScope()

    val signedInUser = user
    if (signedInUser == null) {
        SignInScreen(
            state = uiState,
            onSignIn = {
                if (googleClientId.isBlank()) {
                    uiState = SignInUiState(
                        errorMessage = "GOOGLE_CLIENT_ID is not set. Add it to frontend/local.properties."
                    )
                } else {
                    uiState = SignInUiState(isLoading = true)
                    scope.launch {
                        uiState = when (val result = signInWithGoogle(context, apiBaseUrl, googleClientId)) {
                            is SignInResult.Success -> {
                                user = result.user
                                context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
                                    .edit().putString(PREF_SIGNED_IN_NAME, result.user.displayName).apply()
                                SignInUiState()
                            }
                            SignInResult.Cancelled -> SignInUiState()
                            SignInResult.NoAccount -> SignInUiState(needsAccount = true)
                            is SignInResult.Failure -> SignInUiState(errorMessage = result.message)
                        }
                    }
                }
            },
            onAddAccount = { context.startActivity(addGoogleAccountIntent()) },
            onBack = { activity?.finish() },
            modifier = modifier
        )
    } else {
        SignedInScreen(
            userDisplayName = signedInUser.displayName,
            userEmail = signedInUser.email,
            onSignOut = {
                context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
                    .edit().remove(PREF_SIGNED_IN_NAME).apply()
                activity?.finish()
            },
            modifier = modifier
        )
    }
}

// Gets a Google ID token from the device, then has the backend verify it. The
// user only counts as signed in once the server has accepted the token.
private suspend fun signInWithGoogle(
    context: Context,
    apiBaseUrl: String,
    googleClientId: String
): SignInResult {
    return try {
        // The "Sign in with Google" button flow. Unlike the account bottom
        // sheet, it lets the user add a Google account when none is on the
        // device yet.
        val request = GetCredentialRequest.Builder()
            .addCredentialOption(GetSignInWithGoogleOption.Builder(googleClientId).build())
            .build()
        val credential = CredentialManager.create(context).getCredential(context, request).credential
        if (credential.type != GoogleIdTokenCredential.TYPE_GOOGLE_ID_TOKEN_CREDENTIAL) {
            SignInResult.Failure("Unexpected credential type: ${credential.type}")
        } else {
            val idToken = GoogleIdTokenCredential.createFrom(credential.data).idToken
            SignInResult.Success(authenticate(apiBaseUrl, idToken))
        }
    } catch (_: GetCredentialCancellationException) {
        SignInResult.Cancelled
    } catch (_: NoCredentialException) {
        // Fallback if the flow above still finds no account: offer Android's
        // add-account screen directly.
        SignInResult.NoAccount
    } catch (e: GetCredentialException) {
        android.util.Log.e(TAG, "Sign-in failed: ${e::class.simpleName} — ${e.message}")
        SignInResult.Failure("${e::class.simpleName}: ${e.message}")
    } catch (e: GoogleIdTokenParsingException) {
        android.util.Log.e(TAG, "Could not read Google ID token", e)
        SignInResult.Failure("Could not read Google ID token: ${e.message}")
    } catch (e: IOException) {
        android.util.Log.e(TAG, "Backend rejected sign-in", e)
        SignInResult.Failure("Backend rejected sign-in: ${e.message}")
    } catch (e: JSONException) {
        android.util.Log.e(TAG, "Bad sign-in response", e)
        SignInResult.Failure("Unexpected response from backend: ${e.message}")
    }
}

@Composable
private fun SignInScreen(
    state: SignInUiState,
    onSignIn: () -> Unit,
    onAddAccount: () -> Unit,
    onBack: () -> Unit,
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
            text = "Sign in with your Google account",
            style = MaterialTheme.typography.bodyLarge,
            textAlign = TextAlign.Center,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
            modifier = Modifier.padding(bottom = 48.dp)
        )

        if (state.isLoading) {
            CircularProgressIndicator()
        } else {
            SignInButtons(onSignIn = onSignIn, onBack = onBack)
        }

        if (state.needsAccount) {
            AddAccountPrompt(onAddAccount = onAddAccount)
        }

        if (state.errorMessage != null) {
            Text(
                text = state.errorMessage,
                color = MaterialTheme.colorScheme.error,
                style = MaterialTheme.typography.bodySmall,
                textAlign = TextAlign.Center,
                modifier = Modifier.padding(top = 16.dp)
            )
        }
    }
}

@Composable
private fun SignInButtons(onSignIn: () -> Unit, onBack: () -> Unit) {
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

    Spacer(modifier = Modifier.height(16.dp))

    OutlinedButton(
        onClick = onBack,
        modifier = Modifier
            .fillMaxWidth()
            .height(50.dp)
    ) {
        Text(
            text = stringResource(R.string.btn_back),
            fontWeight = FontWeight.Medium,
            fontSize = 16.sp
        )
    }
}

@Composable
private fun AddAccountPrompt(onAddAccount: () -> Unit) {
    Text(
        text = stringResource(R.string.login_no_account),
        style = MaterialTheme.typography.bodyMedium,
        textAlign = TextAlign.Center,
        modifier = Modifier.padding(top = 16.dp, bottom = 8.dp)
    )
    OutlinedButton(
        onClick = onAddAccount,
        modifier = Modifier.fillMaxWidth()
    ) {
        Text(text = stringResource(R.string.btn_add_account))
    }
}

@Composable
private fun SignedInScreen(
    userDisplayName: String,
    userEmail: String,
    onSignOut: () -> Unit,
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
            text = "Signed in as $userDisplayName",
            fontSize = 20.sp,
            fontWeight = FontWeight.SemiBold
        )
        Text(
            text = userEmail,
            style = MaterialTheme.typography.bodyMedium,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
            modifier = Modifier.padding(top = 4.dp)
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

// Sends the Google ID token to the backend, which verifies it with Google and
// answers with the account it belongs to. Throws IOException if rejected.
private suspend fun authenticate(apiBaseUrl: String, idToken: String): VerifiedUser =
    withContext(Dispatchers.IO) {
        val conn = (URL("${apiBaseUrl.trimEnd('/')}/api/auth/google").openConnection() as HttpURLConnection).apply {
            requestMethod = "POST"
            connectTimeout = HTTP_TIMEOUT_MS
            readTimeout = HTTP_TIMEOUT_MS
            doOutput = true
            setRequestProperty("Content-Type", "application/json")
        }
        val body = JSONObject().put("idToken", idToken).toString()
        conn.outputStream.use { it.write(body.toByteArray()) }

        val json = conn.readJson()
        VerifiedUser(
            firstName = json.optString("firstName"),
            lastName = json.optString("lastName"),
            email = json.optString("email")
        )
    }

// Reads a JSON response, or throws with the backend's own error message
// (sent on the error stream for 4xx/5xx) so it can be shown on screen.
private fun HttpURLConnection.readJson(): JSONObject = try {
    val ok = responseCode in HttpURLConnection.HTTP_OK until HttpURLConnection.HTTP_MULT_CHOICE
    val text = (if (ok) inputStream else errorStream)
        ?.bufferedReader()?.use { it.readText() }.orEmpty()

    if (!ok) {
        val detail = runCatching { JSONObject(text).getString("error") }
            .getOrDefault(text.take(MAX_ERROR_CHARS))
        throw IOException(if (detail.isBlank()) "HTTP $responseCode" else "HTTP $responseCode: $detail")
    }
    JSONObject(text)
} finally {
    disconnect()
}

// Opens Android's add-account screen, filtered to Google accounts.
private fun addGoogleAccountIntent(): Intent =
    Intent(Settings.ACTION_ADD_ACCOUNT)
        .putExtra(Settings.EXTRA_ACCOUNT_TYPES, arrayOf("com.google"))
