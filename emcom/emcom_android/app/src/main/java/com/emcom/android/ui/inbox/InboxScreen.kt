package com.emcom.android.ui.inbox

import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.*
import androidx.compose.material3.*
import androidx.compose.material3.pulltorefresh.PullToRefreshBox
import androidx.compose.runtime.*
import androidx.compose.ui.Modifier
import com.emcom.android.ui.components.*

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun InboxScreen(
    viewModel: InboxViewModel,
    identityName: String,
    onEmailClick: (String) -> Unit,
    onThreadClick: (String) -> Unit,
    onCompose: () -> Unit,
    onWho: () -> Unit,
    onSearch: () -> Unit,
    onLogout: () -> Unit
) {
    val state by viewModel.state.collectAsState()
    var menuExpanded by remember { mutableStateOf(false) }

    Scaffold(
        topBar = {
            TopAppBar(
                title = { Text("emcom ($identityName)") },
                actions = {
                    IconButton(onClick = { menuExpanded = true }) {
                        Icon(Icons.Default.MoreVert, "Menu")
                    }
                    DropdownMenu(
                        expanded = menuExpanded,
                        onDismissRequest = { menuExpanded = false }
                    ) {
                        DropdownMenuItem(
                            text = { Text("Who's Online") },
                            onClick = { menuExpanded = false; onWho() }
                        )
                        DropdownMenuItem(
                            text = { Text("Search") },
                            onClick = { menuExpanded = false; onSearch() }
                        )
                        HorizontalDivider()
                        DropdownMenuItem(
                            text = { Text("Logout") },
                            onClick = { menuExpanded = false; onLogout() }
                        )
                    }
                }
            )
        },
        floatingActionButton = {
            FloatingActionButton(onClick = onCompose) {
                Icon(Icons.Default.Edit, "Compose")
            }
        }
    ) { padding ->
        Column(modifier = Modifier.fillMaxSize().padding(padding)) {
            // Tab row
            TabRow(selectedTabIndex = state.activeTab.ordinal) {
                Tab.entries.forEach { tab ->
                    Tab(
                        selected = state.activeTab == tab,
                        onClick = { viewModel.switchTab(tab) },
                        text = { Text(tab.name) }
                    )
                }
            }

            // Content
            when {
                state.error != null -> ErrorState(state.error!!, onRetry = viewModel::refresh)
                state.isLoading -> LoadingState()
                else -> {
                    PullToRefreshBox(
                        isRefreshing = state.isLoading,
                        onRefresh = viewModel::refresh,
                        modifier = Modifier.fillMaxSize()
                    ) {
                        when (state.activeTab) {
                            Tab.INBOX -> EmailList(state.inboxEmails, showSender = true, onEmailClick)
                            Tab.SENT -> EmailList(state.sentEmails, showSender = false, onEmailClick)
                            Tab.ALL -> EmailList(state.allEmails, showSender = true, onEmailClick)
                            Tab.THREADS -> ThreadList(state.threads, onThreadClick)
                        }
                    }
                }
            }
        }
    }
}

@Composable
private fun EmailList(
    emails: List<com.emcom.android.data.api.EmailDto>,
    showSender: Boolean,
    onClick: (String) -> Unit
) {
    if (emails.isEmpty()) {
        EmptyState("No messages")
    } else {
        LazyColumn {
            items(emails, key = { it.id }) { email ->
                EmailListItem(email, showSender) { onClick(email.id) }
                HorizontalDivider()
            }
        }
    }
}

@Composable
private fun ThreadList(
    threads: List<com.emcom.android.data.api.ThreadDto>,
    onClick: (String) -> Unit
) {
    if (threads.isEmpty()) {
        EmptyState("No threads")
    } else {
        LazyColumn {
            items(threads, key = { it.threadId }) { thread ->
                ThreadListItem(thread) { onClick(thread.threadId) }
                HorizontalDivider()
            }
        }
    }
}
