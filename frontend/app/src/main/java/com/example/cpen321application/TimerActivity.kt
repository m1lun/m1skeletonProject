package com.example.cpen321application

import android.os.Bundle
import android.os.CountDownTimer
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.activity.enableEdgeToEdge
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Button
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableLongStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.example.cpen321application.ui.theme.CPEN321ApplicationTheme

class TimerActivity : ComponentActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        enableEdgeToEdge()
        setContent {
            CPEN321ApplicationTheme {
                Scaffold(modifier = Modifier.fillMaxSize()) { innerPadding ->
                    TimerScreen(modifier = Modifier.padding(innerPadding))
                }
            }
        }
    }
}

@Composable
fun TimerScreen(modifier: Modifier = Modifier) {
    var minutesInput by remember { mutableStateOf("0") }
    var secondsInput by remember { mutableStateOf("0") }
    var timeLeftMs by remember { mutableLongStateOf(0L) }
    var isRunning by remember { mutableStateOf(false) }
    var showSurprise by remember { mutableStateOf(false) }
    var timer by remember { mutableStateOf<CountDownTimer?>(null) }

    DisposableEffect(Unit) {
        onDispose { timer?.cancel() }
    }

    fun startTimer() {
        val minutes = minutesInput.toLongOrNull() ?: 0L
        val seconds = secondsInput.toLongOrNull() ?: 0L
        val totalMs = (minutes * 60 + seconds) * 1000L
        if (totalMs <= 0L) return

        timer?.cancel()
        timeLeftMs = totalMs
        isRunning = true

        timer = object : CountDownTimer(totalMs, 1000L) {
            override fun onTick(millisUntilFinished: Long) {
                timeLeftMs = millisUntilFinished
            }

            override fun onFinish() {
                timeLeftMs = 0L
                isRunning = false
                showSurprise = true
            }
        }.start()
    }

    fun cancelTimer() {
        timer?.cancel()
        timer = null
        isRunning = false
        timeLeftMs = 0L
    }

    val displayMinutes = (timeLeftMs / 1000) / 60
    val displaySeconds = (timeLeftMs / 1000) % 60

    if (showSurprise) {
        AlertDialog(
            onDismissRequest = { showSurprise = false },
            title = { Text(text = stringResource(R.string.timer_surprise_title)) },
            text = { Text(text = stringResource(R.string.timer_surprise_message)) },
            confirmButton = {
                TextButton(onClick = { showSurprise = false }) {
                    Text(text = stringResource(R.string.timer_surprise_dismiss))
                }
            }
        )
    }

    Column(
        modifier = modifier
            .fillMaxSize()
            .padding(24.dp),
        verticalArrangement = Arrangement.Center,
        horizontalAlignment = Alignment.CenterHorizontally
    ) {
        Text(
            text = stringResource(R.string.timer_title),
            fontSize = 28.sp,
            fontWeight = FontWeight.Bold,
            modifier = Modifier.padding(bottom = 32.dp)
        )

        Text(
            text = "%02d:%02d".format(displayMinutes, displaySeconds),
            fontSize = 64.sp,
            fontWeight = FontWeight.Bold,
            textAlign = TextAlign.Center,
            modifier = Modifier
                .fillMaxWidth()
                .padding(bottom = 32.dp)
        )

        Row(
            horizontalArrangement = Arrangement.spacedBy(16.dp),
            modifier = Modifier.padding(bottom = 32.dp)
        ) {
            OutlinedTextField(
                value = minutesInput,
                onValueChange = { if (!isRunning) minutesInput = it.filter { c -> c.isDigit() } },
                label = { Text(stringResource(R.string.timer_minutes_label)) },
                keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Number),
                singleLine = true,
                enabled = !isRunning,
                modifier = Modifier.width(120.dp)
            )

            OutlinedTextField(
                value = secondsInput,
                onValueChange = { if (!isRunning) secondsInput = it.filter { c -> c.isDigit() } },
                label = { Text(stringResource(R.string.timer_seconds_label)) },
                keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Number),
                singleLine = true,
                enabled = !isRunning,
                modifier = Modifier.width(120.dp)
            )
        }

        if (!isRunning) {
            Button(
                onClick = { startTimer() },
                modifier = Modifier.fillMaxWidth()
            ) {
                Text(text = stringResource(R.string.timer_start))
            }
        } else {
            Button(
                onClick = { cancelTimer() },
                modifier = Modifier.fillMaxWidth()
            ) {
                Text(text = stringResource(R.string.timer_cancel))
            }
        }
    }
}
