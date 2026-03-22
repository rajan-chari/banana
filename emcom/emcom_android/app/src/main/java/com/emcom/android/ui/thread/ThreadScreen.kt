package com.emcom.android.ui.thread

import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material.icons.automirrored.filled.Send
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import com.emcom.android.data.api.EmailDto
import com.emcom.android.ui.components.ErrorState
import com.emcom.android.ui.components.LoadingState
import com.emcom.android.ui.components.formatDate

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun ThreadScreen(
    viewModel: ThreadViewModel,
    onBack: () -> Unit,
    onReply: (String) -> Unit
) {
    val state by viewModel.state.collectAsState()

    Scaffold(
        topBar = {
            TopAppBar(
                title = { Text("Thread") },
                navigationIcon = {
                    IconButton(onClick = onBack) {
                        Icon(Icons.AutoMirrored.Filled.ArrowBack, "Back")
                    }
                }
            )
        },
        floatingActionButton = {
            viewModel.lastEmailId()?.let { lastId ->
                FloatingActionButton(onClick = { onReply(lastId) }) {
                    Icon(Icons.AutoMirrored.Filled.Send, "Reply")
                }
            }
        }
    ) { padding ->
        when {
            state.isLoading -> LoadingState()
            state.error != null -> ErrorState(state.error!!, onRetry = viewModel::load)
            else -> {
                LazyColumn(
                    modifier = Modifier.fillMaxSize().padding(padding),
                    contentPadding = PaddingValues(16.dp),
                    verticalArrangement = Arrangement.spacedBy(12.dp)
                ) {
                    items(state.emails, key = { it.id }) { email ->
                        ThreadEmailCard(email)
                    }
                }
            }
        }
    }
}

@Composable
private fun ThreadEmailCard(email: EmailDto) {
    Card(modifier = Modifier.fillMaxWidth()) {
        Column(
            modifier = Modifier.padding(12.dp),
            verticalArrangement = Arrangement.spacedBy(4.dp)
        ) {
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.SpaceBetween
            ) {
                Text(email.sender, fontWeight = FontWeight.Bold)
                Text(formatDate(email.createdAt), style = MaterialTheme.typography.labelSmall)
            }
            if (email.subject.isNotBlank()) {
                Text(email.subject, style = MaterialTheme.typography.titleSmall)
            }
            Spacer(Modifier.height(4.dp))
            Text(email.body, style = MaterialTheme.typography.bodyMedium)
        }
    }
}
