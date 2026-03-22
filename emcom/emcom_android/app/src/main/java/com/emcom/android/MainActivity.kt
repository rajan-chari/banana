package com.emcom.android

import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.activity.enableEdgeToEdge
import androidx.compose.runtime.*
import androidx.navigation.compose.rememberNavController
import com.emcom.android.data.api.LocalIdentity
import com.emcom.android.ui.navigation.EmcomNavGraph
import com.emcom.android.ui.navigation.Routes
import com.emcom.android.ui.theme.EmcomTheme
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.runBlocking

class MainActivity : ComponentActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        enableEdgeToEdge()

        val app = application as EmcomApplication
        val repository = app.repository

        // Check for saved identity to determine start destination
        val savedIdentity: LocalIdentity? = runBlocking {
            app.identityStore.identity.first()
        }

        val startDest: String
        val identityName: String

        if (savedIdentity != null) {
            // Restore session
            repository.configure(savedIdentity.server, savedIdentity.name)
            startDest = Routes.MAIN
            identityName = savedIdentity.name
        } else {
            startDest = Routes.SETUP
            identityName = ""
        }

        setContent {
            EmcomTheme {
                val navController = rememberNavController()
                // Track identity name reactively
                val identity by app.identityStore.identity.collectAsState(initial = savedIdentity)
                val currentName = identity?.name ?: identityName

                EmcomNavGraph(
                    navController = navController,
                    repository = repository,
                    startDestination = startDest,
                    identityName = currentName
                )
            }
        }
    }
}
