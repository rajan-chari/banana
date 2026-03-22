package com.emcom.android.ui.compose

import androidx.compose.foundation.layout.*
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material.icons.automirrored.filled.Send
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun ComposeScreen(
    viewModel: ComposeViewModel,
    onBack: () -> Unit,
    onSent: () -> Unit
) {
    val state by viewModel.state.collectAsState()

    LaunchedEffect(state.sent) {
        if (state.sent) onSent()
    }

    Scaffold(
        topBar = {
            TopAppBar(
                title = { Text(if (state.replyToEmail != null) "Reply" else "Compose") },
                navigationIcon = {
                    IconButton(onClick = onBack) {
                        Icon(Icons.AutoMirrored.Filled.ArrowBack, "Back")
                    }
                },
                actions = {
                    IconButton(
                        onClick = viewModel::send,
                        enabled = !state.sending && state.to.isNotBlank()
                    ) {
                        Icon(Icons.AutoMirrored.Filled.Send, "Send")
                    }
                }
            )
        }
    ) { padding ->
        Column(
            modifier = Modifier
                .fillMaxSize()
                .padding(padding)
                .padding(16.dp),
            verticalArrangement = Arrangement.spacedBy(12.dp)
        ) {
            OutlinedTextField(
                value = state.to,
                onValueChange = viewModel::updateTo,
                label = { Text("To") },
                placeholder = { Text("alice, bob") },
                modifier = Modifier.fillMaxWidth(),
                singleLine = true,
                readOnly = state.replyToEmail != null
            )

            OutlinedTextField(
                value = state.subject,
                onValueChange = viewModel::updateSubject,
                label = { Text("Subject") },
                modifier = Modifier.fillMaxWidth(),
                singleLine = true
            )

            OutlinedTextField(
                value = state.body,
                onValueChange = viewModel::updateBody,
                label = { Text("Message") },
                modifier = Modifier
                    .fillMaxWidth()
                    .weight(1f),
                minLines = 5
            )

            if (state.sending) {
                LinearProgressIndicator(modifier = Modifier.fillMaxWidth())
            }

            state.error?.let {
                Text(it, color = MaterialTheme.colorScheme.error)
            }

            // Show original message for replies
            state.replyToEmail?.let { original ->
                HorizontalDivider()
                Text(
                    "Original from ${original.sender}:",
                    style = MaterialTheme.typography.labelMedium
                )
                Text(
                    original.body.take(300),
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.outline
                )
            }
        }
    }
}
