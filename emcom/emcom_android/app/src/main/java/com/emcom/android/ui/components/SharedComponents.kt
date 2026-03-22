package com.emcom.android.ui.components

import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.material3.*
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import com.emcom.android.data.api.EmailDto
import com.emcom.android.data.api.ThreadDto
import java.time.OffsetDateTime
import java.time.format.DateTimeFormatter
import java.time.format.DateTimeParseException

private val displayFormat = DateTimeFormatter.ofPattern("MM/dd HH:mm")

fun formatDate(iso: String): String {
    return try {
        OffsetDateTime.parse(iso).format(displayFormat)
    } catch (e: DateTimeParseException) {
        iso.take(16)
    }
}

fun shortId(id: String): String = id.take(8)

@Composable
fun EmailListItem(
    email: EmailDto,
    showSender: Boolean = true,
    onClick: () -> Unit
) {
    val isUnread = "unread" in email.tags

    ListItem(
        headlineContent = {
            Text(
                text = email.subject.ifBlank { "(no subject)" },
                fontWeight = if (isUnread) FontWeight.Bold else FontWeight.Normal,
                maxLines = 1,
                overflow = TextOverflow.Ellipsis
            )
        },
        supportingContent = {
            Text(
                text = if (showSender) "From: ${email.sender}" else "To: ${email.to.joinToString()}",
                maxLines = 1,
                overflow = TextOverflow.Ellipsis,
                style = MaterialTheme.typography.bodySmall
            )
        },
        trailingContent = {
            Column(horizontalAlignment = Alignment.End) {
                Text(
                    formatDate(email.createdAt),
                    style = MaterialTheme.typography.labelSmall
                )
                if (email.tags.isNotEmpty()) {
                    Text(
                        email.tags.joinToString(" "),
                        style = MaterialTheme.typography.labelSmall,
                        color = MaterialTheme.colorScheme.primary
                    )
                }
            }
        },
        modifier = Modifier.clickable(onClick = onClick)
    )
}

@Composable
fun ThreadListItem(
    thread: ThreadDto,
    onClick: () -> Unit
) {
    ListItem(
        headlineContent = {
            Text(
                text = thread.subject.ifBlank { "(no subject)" },
                maxLines = 1,
                overflow = TextOverflow.Ellipsis
            )
        },
        supportingContent = {
            Text(
                text = thread.participants.joinToString(", "),
                maxLines = 1,
                overflow = TextOverflow.Ellipsis,
                style = MaterialTheme.typography.bodySmall
            )
        },
        trailingContent = {
            Column(horizontalAlignment = Alignment.End) {
                Text(
                    "${thread.emailCount} msgs",
                    style = MaterialTheme.typography.labelSmall
                )
                Text(
                    formatDate(thread.lastActivity),
                    style = MaterialTheme.typography.labelSmall
                )
            }
        },
        modifier = Modifier.clickable(onClick = onClick)
    )
}

@Composable
fun EmptyState(message: String) {
    Box(
        modifier = Modifier.fillMaxSize(),
        contentAlignment = Alignment.Center
    ) {
        Text(message, style = MaterialTheme.typography.bodyLarge, color = MaterialTheme.colorScheme.outline)
    }
}

@Composable
fun LoadingState() {
    Box(
        modifier = Modifier.fillMaxSize(),
        contentAlignment = Alignment.Center
    ) {
        CircularProgressIndicator()
    }
}

@Composable
fun ErrorState(message: String, onRetry: () -> Unit) {
    Box(
        modifier = Modifier.fillMaxSize(),
        contentAlignment = Alignment.Center
    ) {
        Column(horizontalAlignment = Alignment.CenterHorizontally) {
            Text(message, color = MaterialTheme.colorScheme.error)
            Spacer(Modifier.height(8.dp))
            Button(onClick = onRetry) { Text("Retry") }
        }
    }
}
