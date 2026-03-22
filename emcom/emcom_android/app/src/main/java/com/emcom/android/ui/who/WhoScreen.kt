package com.emcom.android.ui.who

import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import com.emcom.android.ui.components.ErrorState
import com.emcom.android.ui.components.LoadingState
import com.emcom.android.ui.components.formatDate

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun WhoScreen(
    viewModel: WhoViewModel,
    onBack: () -> Unit
) {
    val state by viewModel.state.collectAsState()

    Scaffold(
        topBar = {
            TopAppBar(
                title = { Text("Who's Online") },
                navigationIcon = {
                    IconButton(onClick = onBack) {
                        Icon(Icons.AutoMirrored.Filled.ArrowBack, "Back")
                    }
                }
            )
        }
    ) { padding ->
        when {
            state.isLoading -> LoadingState()
            state.error != null -> ErrorState(state.error!!, onRetry = viewModel::load)
            else -> {
                LazyColumn(
                    modifier = Modifier.fillMaxSize().padding(padding)
                ) {
                    items(state.identities) { identity ->
                        ListItem(
                            headlineContent = { Text(identity.name) },
                            supportingContent = {
                                if (identity.description.isNotBlank()) {
                                    Text(identity.description)
                                }
                            },
                            trailingContent = {
                                Text(
                                    formatDate(identity.lastSeen),
                                    style = MaterialTheme.typography.labelSmall
                                )
                            }
                        )
                        HorizontalDivider()
                    }
                }
            }
        }
    }
}
