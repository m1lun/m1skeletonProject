package com.example.cpen321application

import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.activity.enableEdgeToEdge
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.aspectRatio
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.material3.Button
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateListOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.example.cpen321application.ui.theme.CPEN321ApplicationTheme
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.Response
import okhttp3.WebSocket
import okhttp3.WebSocketListener
import org.json.JSONObject

class PixelArtActivity : ComponentActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        enableEdgeToEdge()
        setContent {
            CPEN321ApplicationTheme {
                Scaffold(modifier = Modifier.fillMaxSize()) { innerPadding ->
                    PixelArtScreen(
                        apiBaseUrl = BuildConfig.API_BASE_URL,
                        modifier = Modifier.padding(innerPadding)
                    )
                }
            }
        }
    }
}

private fun parseHexColor(hex: String): Color {
    val clean = hex.trim().removePrefix("#")
    return try {
        when (clean.length) {
            6 -> {
                val r = clean.substring(0, 2).toInt(16)
                val g = clean.substring(2, 4).toInt(16)
                val b = clean.substring(4, 6).toInt(16)
                Color(r, g, b)
            }
            8 -> {
                val a = clean.substring(0, 2).toInt(16)
                val r = clean.substring(2, 4).toInt(16)
                val g = clean.substring(4, 6).toInt(16)
                val b = clean.substring(6, 8).toInt(16)
                Color(r, g, b, a)
            }
            3 -> {
                val r = clean.substring(0, 1).repeat(2).toInt(16)
                val g = clean.substring(1, 2).repeat(2).toInt(16)
                val b = clean.substring(2, 3).repeat(2).toInt(16)
                Color(r, g, b)
            }
            else -> Color.White
        }
    } catch (_: Exception) {
        Color.White
    }
}

private fun getWebSocketUrl(apiBaseUrl: String): String {
    val trimmed = apiBaseUrl.trimEnd('/')
    val wsBase = if (trimmed.startsWith("https://", ignoreCase = true)) {
        "wss://" + trimmed.substring(8)
    } else if (trimmed.startsWith("http://", ignoreCase = true)) {
        "ws://" + trimmed.substring(7)
    } else {
        "ws://$trimmed"
    }
    return "$wsBase/pixels"
}

@Composable
fun PixelArtScreen(apiBaseUrl: String, modifier: Modifier = Modifier) {
    val context = LocalContext.current
    val activity = context as? ComponentActivity

    val defaultColor = Color(0xFFF0F0F0)
    val grid = remember { mutableStateListOf<Color>().apply { repeat(256) { add(defaultColor) } } }
    var statusText by remember { mutableStateOf("Connecting to live stream…") }

    DisposableEffect(apiBaseUrl) {
        val client = OkHttpClient()
        val wsUrl = getWebSocketUrl(apiBaseUrl)
        val request = Request.Builder().url(wsUrl).build()

        var lastPixelTime = 0L

        val webSocket = client.newWebSocket(request, object : WebSocketListener() {
            override fun onOpen(webSocket: WebSocket, response: Response) {
                activity?.runOnUiThread {
                    statusText = "Receiving live pixel stream"
                }
            }

            override fun onMessage(webSocket: WebSocket, text: String) {
                try {
                    val json = JSONObject(text)
                    val x = json.getInt("x")
                    val y = json.getInt("y")
                    val colorHex = json.getString("color")
                    if (x in 0..15 && y in 0..15) {
                        val index = y * 16 + x
                        val color = parseHexColor(colorHex)
                        val now = System.currentTimeMillis()
                        activity?.runOnUiThread {
                            if (lastPixelTime > 0L && (now - lastPixelTime) > 3000L) {
                                for (i in 0 until 256) {
                                    grid[i] = defaultColor
                                }
                            }
                            lastPixelTime = now
                            grid[index] = color
                        }
                    }
                } catch (_: Exception) {
                }
            }

            override fun onFailure(webSocket: WebSocket, t: Throwable, response: Response?) {
                activity?.runOnUiThread {
                    statusText = "Stream disconnected"
                }
            }

            override fun onClosed(webSocket: WebSocket, code: Int, reason: String) {
                activity?.runOnUiThread {
                    statusText = "Stream closed"
                }
            }
        })

        onDispose {
            webSocket.close(1000, "Screen exited")
            client.dispatcher.executorService.shutdown()
        }
    }

    Column(
        modifier = modifier
            .fillMaxSize()
            .padding(16.dp),
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.SpaceBetween
    ) {
        Row(
            modifier = Modifier.fillMaxWidth(),
            horizontalArrangement = Arrangement.Start
        ) {
            OutlinedButton(onClick = { activity?.finish() }) {
                Text(text = stringResource(R.string.btn_back))
            }
        }

        Column(
            horizontalAlignment = Alignment.CenterHorizontally,
            modifier = Modifier.weight(1f, fill = false)
        ) {
            Text(
                text = "Pixel Art",
                fontSize = 24.sp,
                fontWeight = FontWeight.Bold,
                modifier = Modifier.padding(bottom = 8.dp)
            )

            Text(
                text = statusText,
                style = MaterialTheme.typography.bodyMedium,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
                modifier = Modifier.padding(bottom = 20.dp)
            )

            Box(
                modifier = Modifier
                    .fillMaxWidth()
                    .aspectRatio(1f)
                    .border(1.dp, Color.Gray)
                    .background(Color.White)
            ) {
                Column(modifier = Modifier.fillMaxSize()) {
                    for (row in 0 until 16) {
                        Row(
                            modifier = Modifier
                                .weight(1f)
                                .fillMaxWidth()
                        ) {
                            for (col in 0 until 16) {
                                val index = row * 16 + col
                                val color = grid.getOrElse(index) { defaultColor }
                                Box(
                                    modifier = Modifier
                                        .weight(1f)
                                        .fillMaxSize()
                                        .background(color)
                                        .border(0.2.dp, Color(0xFFE0E0E0))
                                )
                            }
                        }
                    }
                }
            }
        }

        Button(
            onClick = { activity?.finish() },
            modifier = Modifier
                .fillMaxWidth()
                .padding(vertical = 16.dp)
        ) {
            Text(text = stringResource(R.string.btn_back))
        }
    }
}
