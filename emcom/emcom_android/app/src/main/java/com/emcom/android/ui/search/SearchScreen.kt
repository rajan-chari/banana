package com.emcom.android.ui.search

import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material.icons.filled.Search
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import com.emcom.android.ui.components.EmailListItem
import com.emcom.android.ui.components.EmptyState

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun SearchScreen(
    viewModel: SearchViewModel,
    onBack: () -> Unit,
    onEmailClick: (String) -> Unit
) {
    val state by viewModel.state.collectAsState()

    Scaffold(
        topBar = {
            TopAppBar(
                title = { Text("Search") },
                navigationIcon = {
                    IconButton(onClick = onBack) {
                        Icon(Icons.AutoMirrored.Filled.ArrowBack, "Back")
                    }
                }
            )
        }
    ) { padding ->
        Column(
            modifier = Modifier.fillMaxSize().padding(padding).padding(16.dp),
            verticalArrangement = Arrangement.spacedBy(8.dp)
        ) {
            // Filter fields
            Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                OutlinedTextField(
                    value = state.from,
                    onValueChange = viewModel::updateFrom,
                    label = { Text("From") },
                    modifier = Modifier.weight(1f),
                    singleLine = true
                )
                OutlinedTextField(
                    value = state.to,
                    onValueChange = viewModel::updateTo,
                    label = { Text("To") },
                    modifier = Modifier.weight(1f),
                    singleLine = true
                )
            }

            OutlinedTextField(
                value = state.subject,
                onValueChange = viewModel::updateSubject,
                label = { Text("Subject") },
                modifier = Modifier.fillMaxWidth(),
                singleLine = true
            )

            Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                OutlinedTextField(
                    value = state.tag,
                    onValueChange = viewModel::updateTag,
                    label = { Text("Tag") },
                    modifier = Modifier.weight(1f),
                    singleLine = true
                )
                Button(
                    onClick = viewModel::search,
                    enabled = !state.isSearching
                ) {
                    Icon(Icons.Default.Search, null)
                    Spacer(Modifier.width(4.dp))
                    Text("Search")
                }
            }

            if (state.isSearching) {
                LinearProgressIndicator(modifier = Modifier.fillMaxWidth())
            }

            state.error?.let {
                Text(it, color = MaterialTheme.colorScheme.error)
            }

            // Results
            HorizontalDivider()
            state.results?.let { results ->
                if (results.isEmpty()) {
                    EmptyState("No results")
                } else {
                    LazyColumn {
                        items(results, key = { it.id }) { email ->
                            EmailListItem(email, showSender = true) { onEmailClick(email.id) }
                            HorizontalDivider()
                        }
                    }
                }
            }
        }
    }
}
