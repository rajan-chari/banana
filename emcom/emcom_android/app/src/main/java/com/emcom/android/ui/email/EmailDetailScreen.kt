package com.emcom.android.ui.email

import androidx.compose.foundation.layout.*
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material.icons.filled.Done
import androidx.compose.material.icons.automirrored.filled.Send
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import com.emcom.android.ui.components.ErrorState
import com.emcom.android.ui.components.LoadingState
import com.emcom.android.ui.components.formatDate
import com.emcom.android.ui.components.shortId

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun EmailDetailScreen(
    viewModel: EmailDetailViewModel,
    onBack: () -> Unit,
    onReply: (String) -> Unit
) {
    val state by viewModel.state.collectAsState()
    val snackbarHostState = remember { SnackbarHostState() }

    LaunchedEffect(state.actionMessage) {
        state.actionMessage?.let {
            snackbarHostState.showSnackbar(it)
            viewModel.clearActionMessage()
        }
    }

    Scaffold(
        topBar = {
            TopAppBar(
                title = { Text("Email") },
                navigationIcon = {
                    IconButton(onClick = onBack) {
                        Icon(Icons.AutoMirrored.Filled.ArrowBack, "Back")
                    }
                },
                actions = {
                    state.email?.let { email ->
                        IconButton(onClick = { onReply(email.id) }) {
                            Icon(Icons.AutoMirrored.Filled.Send, "Reply")
                        }
                        if ("handled" !in email.tags) {
                            IconButton(onClick = viewModel::markHandled) {
                                Icon(Icons.Default.Done, "Mark Handled")
                            }
                        }
                    }
                }
            )
        },
        snackbarHost = { SnackbarHost(snackbarHostState) }
    ) { padding ->
        when {
            state.isLoading -> LoadingState()
            state.error != null -> ErrorState(state.error!!) {}
            state.email != null -> {
                val email = state.email!!
                Column(
                    modifier = Modifier
                        .fillMaxSize()
                        .padding(padding)
                        .padding(16.dp)
                        .verticalScroll(rememberScrollState()),
                    verticalArrangement = Arrangement.spacedBy(8.dp)
                ) {
                    // Subject
                    Text(
                        email.subject.ifBlank { "(no subject)" },
                        style = MaterialTheme.typography.headlineSmall,
                        fontWeight = FontWeight.Bold
                    )

                    // Headers
                    HeaderRow("From", email.sender)
                    HeaderRow("To", email.to.joinToString(", "))
                    if (email.cc.isNotEmpty()) {
                        HeaderRow("CC", email.cc.joinToString(", "))
                    }
                    HeaderRow("Date", formatDate(email.createdAt))
                    HeaderRow("ID", shortId(email.id))

                    // Tags
                    if (email.tags.isNotEmpty()) {
                        Row(horizontalArrangement = Arrangement.spacedBy(4.dp)) {
                            email.tags.forEach { tag ->
                                AssistChip(
                                    onClick = { viewModel.removeTag(tag) },
                                    label = { Text(tag) }
                                )
                            }
                        }
                    }

                    HorizontalDivider(modifier = Modifier.padding(vertical = 8.dp))

                    // Body
                    Text(email.body, style = MaterialTheme.typography.bodyLarge)
                }
            }
        }
    }
}

@Composable
private fun HeaderRow(label: String, value: String) {
    Row {
        Text(
            "$label: ",
            style = MaterialTheme.typography.bodyMedium,
            fontWeight = FontWeight.Bold
        )
        Text(value, style = MaterialTheme.typography.bodyMedium)
    }
}
