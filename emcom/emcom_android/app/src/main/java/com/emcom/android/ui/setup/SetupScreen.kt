package com.emcom.android.ui.setup

import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyRow
import androidx.compose.foundation.lazy.items
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Check
import androidx.compose.material.icons.filled.Warning
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun SetupScreen(
    viewModel: SetupViewModel,
    onSetupComplete: () -> Unit
) {
    val state by viewModel.state.collectAsState()

    LaunchedEffect(state.registered) {
        if (state.registered) onSetupComplete()
    }

    Scaffold(
        topBar = {
            TopAppBar(title = { Text("emcom Setup") })
        }
    ) { padding ->
        Column(
            modifier = Modifier
                .fillMaxSize()
                .padding(padding)
                .padding(16.dp),
            verticalArrangement = Arrangement.spacedBy(16.dp)
        ) {
            // Step 1: Server URL
            Text("Server URL", style = MaterialTheme.typography.titleMedium)
            OutlinedTextField(
                value = state.serverUrl,
                onValueChange = viewModel::updateServerUrl,
                label = { Text("DevTunnel URL") },
                placeholder = { Text("https://abc123.devtunnels.ms") },
                modifier = Modifier.fillMaxWidth(),
                singleLine = true,
                trailingIcon = {
                    if (state.serverConnected) {
                        Icon(Icons.Default.Check, "Connected", tint = MaterialTheme.colorScheme.primary)
                    }
                }
            )

            Button(
                onClick = viewModel::checkServer,
                enabled = state.serverUrl.isNotBlank() && !state.checkingServer
            ) {
                if (state.checkingServer) {
                    CircularProgressIndicator(modifier = Modifier.size(16.dp), strokeWidth = 2.dp)
                    Spacer(Modifier.width(8.dp))
                }
                Text("Check Connection")
            }

            state.serverError?.let { error ->
                Row(verticalAlignment = Alignment.CenterVertically) {
                    Icon(Icons.Default.Warning, null, tint = MaterialTheme.colorScheme.error)
                    Spacer(Modifier.width(8.dp))
                    Text(error, color = MaterialTheme.colorScheme.error)
                }
            }

            // Step 2: Registration (shown after server connected)
            if (state.serverConnected) {
                HorizontalDivider()
                Text("Register Identity", style = MaterialTheme.typography.titleMedium)

                OutlinedTextField(
                    value = state.selectedName,
                    onValueChange = viewModel::updateSelectedName,
                    label = { Text("Name (blank for auto-assign)") },
                    modifier = Modifier.fillMaxWidth(),
                    singleLine = true
                )

                if (state.availableNames.isNotEmpty()) {
                    Text("Available names:", style = MaterialTheme.typography.labelMedium)
                    LazyRow(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                        items(state.availableNames.take(20)) { name ->
                            FilterChip(
                                selected = state.selectedName == name,
                                onClick = { viewModel.updateSelectedName(name) },
                                label = { Text(name) }
                            )
                        }
                    }
                }

                OutlinedTextField(
                    value = state.description,
                    onValueChange = viewModel::updateDescription,
                    label = { Text("Description (optional)") },
                    modifier = Modifier.fillMaxWidth(),
                    singleLine = true
                )

                Button(
                    onClick = viewModel::register,
                    enabled = !state.registering
                ) {
                    if (state.registering) {
                        CircularProgressIndicator(modifier = Modifier.size(16.dp), strokeWidth = 2.dp)
                        Spacer(Modifier.width(8.dp))
                    }
                    Text("Register")
                }

                state.registerError?.let { error ->
                    Text(error, color = MaterialTheme.colorScheme.error)
                }
            }
        }
    }
}
