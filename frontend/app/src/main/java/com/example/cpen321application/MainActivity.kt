package com.example.cpen321application

import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.activity.enableEdgeToEdge
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.padding
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Text
import androidx.compose.ui.Modifier
import com.example.cpen321application.ui.component.ListingItemPreview
import com.example.cpen321application.ui.theme.CPEN321ApplicationTheme
import com.example.cpen321application.ui.component.ListingItemPreview
import com.example.cpen321application.ui.screen.ListingScreen

// Stub: main screen to build out once login completes.
class MainActivity : ComponentActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        enableEdgeToEdge()
        setContent {
            ListingScreen()
            //ListingItemPreview()
            //CPEN321ApplicationTheme {
                //Scaffold(modifier = Modifier.fillMaxSize()) { innerPadding ->
                    //Text(text = "Main", modifier = Modifier.padding(innerPadding))
                //}
            //}
        }
    }
}
