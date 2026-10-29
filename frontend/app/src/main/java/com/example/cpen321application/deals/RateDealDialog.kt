package com.example.cpen321application.deals

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Star
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.unit.dp
import com.example.cpen321application.R

object RateTags {
    const val STAR_PREFIX = "rate_star_"
    const val COMMENT = "rate_comment"
    const val SUBMIT = "rate_submit"
    const val CANCEL = "rate_cancel"
}

@Composable
fun RateDealDialog(
    rating: RatingUiState,
    onSubmit: (stars: Int, comment: String) -> Unit,
    onDismiss: () -> Unit
) {
    var stars by rememberSaveable { mutableIntStateOf(0) }
    var comment by rememberSaveable { mutableStateOf("") }
    AlertDialog(
        onDismissRequest = onDismiss,
        title = { Text(text = stringResource(R.string.rate_title)) },
        text = {
            Column(verticalArrangement = Arrangement.spacedBy(12.dp)) {
                StarPicker(selected = stars, enabled = !rating.isSubmitting, onSelect = { stars = it })
                OutlinedTextField(
                    value = comment,
                    onValueChange = { if (it.length <= MAX_COMMENT_LENGTH) comment = it },
                    label = { Text(text = stringResource(R.string.rate_comment_label)) },
                    supportingText = {
                        Text(text = stringResource(R.string.rate_counter, comment.length, MAX_COMMENT_LENGTH))
                    },
                    enabled = !rating.isSubmitting,
                    modifier = Modifier.fillMaxWidth().testTag(RateTags.COMMENT)
                )
                rating.failure?.let {
                    Text(text = failureText(it), color = MaterialTheme.colorScheme.error)
                }
            }
        },
        confirmButton = {
            TextButton(
                onClick = { onSubmit(stars, comment) },
                enabled = stars > 0 && !rating.isSubmitting,
                modifier = Modifier.testTag(RateTags.SUBMIT)
            ) { Text(text = stringResource(R.string.rate_submit)) }
        },
        dismissButton = {
            TextButton(onClick = onDismiss, enabled = !rating.isSubmitting, modifier = Modifier.testTag(RateTags.CANCEL)) {
                Text(text = stringResource(R.string.action_cancel))
            }
        }
    )
}

@Composable
private fun StarPicker(selected: Int, enabled: Boolean, onSelect: (Int) -> Unit) {
    Row(horizontalArrangement = Arrangement.Center, modifier = Modifier.fillMaxWidth()) {
        for (star in 1..MAX_STARS) {
            IconButton(onClick = { onSelect(star) }, enabled = enabled, modifier = Modifier.testTag("${RateTags.STAR_PREFIX}$star")) {
                Icon(
                    imageVector = Icons.Filled.Star,
                    contentDescription = stringResource(R.string.rate_star, star),
                    tint = if (star <= selected) MaterialTheme.colorScheme.primary else MaterialTheme.colorScheme.outlineVariant
                )
            }
        }
    }
}

@Composable
private fun failureText(failure: RateFailure): String = when (failure) {
    RateFailure.AlreadyRated -> stringResource(R.string.rate_already_rated)
    RateFailure.Unreachable -> stringResource(R.string.error_unreachable)
    is RateFailure.Rejected -> failure.message
}
