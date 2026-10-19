package com.example.cpen321application.post

import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.AlertDialog
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material3.Button
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.Card
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.FilterChip
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.SegmentedButton
import androidx.compose.material3.SegmentedButtonDefaults
import androidx.compose.material3.SingleChoiceSegmentedButtonRow
import androidx.compose.material3.Slider
import androidx.compose.material3.SuggestionChip
import androidx.compose.material3.Switch
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.unit.dp

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun PostEditorScreen(viewModel: PostViewModel, padding: PaddingValues) {
    val seller = viewModel.mode == Mode.SELLING
    var showAddField by remember { mutableStateOf(false) }
    val picker = rememberLauncherForActivityResult(ActivityResultContracts.GetMultipleContents()) {
        viewModel.addPhotos(it)
    }

    Column(
        modifier = Modifier
            .fillMaxSize()
            .padding(padding)
            .verticalScroll(rememberScrollState())
            .padding(16.dp),
        verticalArrangement = Arrangement.spacedBy(12.dp),
    ) {
        Row(verticalAlignment = Alignment.CenterVertically) {
            IconButton(onClick = viewModel::stopEditing) {
                Icon(Icons.AutoMirrored.Filled.ArrowBack, contentDescription = "Back")
            }
            val noun = if (seller) "listing" else "request"
            Text(
                if (viewModel.editingId == null) viewModel.mode.newLabel else "Edit $noun",
                style = MaterialTheme.typography.titleLarge,
            )
        }

        SuggestField(
            label = "Category *",
            value = viewModel.category,
            onValueChange = { viewModel.category = it },
            options = viewModel.categories,
        )

        if (seller) {
            OutlinedTextField(
                value = viewModel.price,
                onValueChange = { viewModel.price = it },
                label = { Text("Price *") },
                keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Decimal),
                singleLine = true,
                modifier = Modifier.fillMaxWidth(),
            )
            Text("Condition *", style = MaterialTheme.typography.labelLarge)
            Row(
                modifier = Modifier.horizontalScroll(rememberScrollState()),
                horizontalArrangement = Arrangement.spacedBy(8.dp),
            ) {
                CONDITIONS.forEach { c ->
                    val selected = viewModel.condition == c
                    OutlinedButton(onClick = { viewModel.condition = c }) {
                        Text(if (selected) "● ${c.titleCase()}" else c.titleCase())
                    }
                }
            }
        }

        OutlinedTextField(
            value = viewModel.address,
            onValueChange = viewModel::onAddressChange,
            label = { Text("Address *") },
            singleLine = true,
            isError = viewModel.showAddressError,
            supportingText = {
                when {
                    viewModel.showAddressError ->
                        Text("Choose your address from the suggestions list")
                    viewModel.addressConfirmed -> Text("✓ Address confirmed")
                    viewModel.addressSuggestions.isNotEmpty() -> Text("Pick your address from the list below")
                    else -> Text("Start typing your address, then pick it from the list")
                }
            },
            modifier = Modifier.fillMaxWidth(),
        )
        if (viewModel.addressSuggestions.isNotEmpty()) {
            Card(modifier = Modifier.fillMaxWidth()) {
                Column {
                    viewModel.addressSuggestions.forEach { suggestion ->
                        TextButton(
                            onClick = { viewModel.pickAddress(suggestion) },
                            modifier = Modifier.fillMaxWidth(),
                        ) {
                            Text(
                                "📍 ${suggestion.label}",
                                modifier = Modifier.fillMaxWidth(),
                                style = MaterialTheme.typography.bodyMedium,
                            )
                        }
                    }
                }
            }
        }
        OutlinedTextField(
            value = viewModel.description,
            onValueChange = { viewModel.description = it },
            label = { Text("Description") },
            minLines = 2,
            modifier = Modifier.fillMaxWidth(),
        )

        Text(
            "Photos ${viewModel.photos.size + viewModel.existingPhotoIds.size}/$MAX_PHOTOS" +
                if (seller) " *" else "",
            style = MaterialTheme.typography.labelLarge,
        )
        Row(
            modifier = Modifier.horizontalScroll(rememberScrollState()),
            horizontalArrangement = Arrangement.spacedBy(8.dp),
        ) {
            OutlinedButton(onClick = { picker.launch("image/*") }) { Text("+ Add") }
            viewModel.existingPhotoIds.forEachIndexed { index, _ ->
                OutlinedButton(onClick = { viewModel.removeExistingPhoto(index) }) {
                    Text("Photo ${index + 1} ✕")
                }
            }
            viewModel.photos.forEachIndexed { index, uri ->
                OutlinedButton(onClick = { viewModel.removePhoto(index) }) {
                    Text("${uri.lastPathSegment?.takeLast(8) ?: "photo"} ✕")
                }
            }
        }

        Text(
            if (seller) "Attributes" else "Requirements",
            style = MaterialTheme.typography.titleMedium,
        )
        viewModel.rows.forEachIndexed { index, row ->
            RowEditor(
                row = row,
                seller = seller,
                viewModel = viewModel,
                onChange = { viewModel.updateRow(index, it) },
                onRemove = if (row.isCustom) ({ viewModel.removeRow(index) }) else null,
            )
        }

        OutlinedButton(onClick = { showAddField = true }) { Text("+ Add field") }

        Button(
            onClick = viewModel::submit,
            enabled = !viewModel.saving,
            modifier = Modifier.fillMaxWidth(),
        ) {
            if (viewModel.saving) {
                CircularProgressIndicator(modifier = Modifier.padding(2.dp))
            } else {
                val create = if (seller) "Create listing" else "Create request"
                Text(if (viewModel.editingId == null) create else "Save changes")
            }
        }
    }

    if (showAddField) {
        AddFieldDialog(
            saved = viewModel.savedFields,
            onAdd = { label, type ->
                val error = viewModel.addCustomRow(label, type)
                if (error == null) showAddField = false else viewModel.message = error
            },
            onDismiss = { showAddField = false },
        )
    }
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
private fun RowEditor(
    row: RowState,
    seller: Boolean,
    viewModel: PostViewModel,
    onChange: (RowState) -> Unit,
    onRemove: (() -> Unit)?,
) {
    Card(modifier = Modifier.fillMaxWidth()) {
        Column(
            modifier = Modifier.padding(12.dp),
            verticalArrangement = Arrangement.spacedBy(8.dp),
        ) {
            Row(verticalAlignment = Alignment.CenterVertically) {
                Text(
                    row.label + if (row.required) " *" else "" + if (row.isCustom) " (custom)" else "",
                    fontWeight = FontWeight.SemiBold,
                    modifier = Modifier.weight(1f),
                )
                if (onRemove != null) TextButton(onClick = onRemove) { Text("✕") }
            }

            when {
                row.type == "bool" -> Switch(
                    checked = row.boolValue,
                    onCheckedChange = { onChange(row.copy(boolValue = it)) },
                )
                row.type == "dimensions" -> Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    listOf("W" to row.width, "H" to row.height, "D" to row.depth).forEachIndexed { i, (name, v) ->
                        OutlinedTextField(
                            value = v,
                            onValueChange = {
                                onChange(
                                    when (i) {
                                        0 -> row.copy(width = it)
                                        1 -> row.copy(height = it)
                                        else -> row.copy(depth = it)
                                    },
                                )
                            },
                            label = { Text(name) },
                            keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Decimal),
                            singleLine = true,
                            modifier = Modifier.weight(1f),
                        )
                    }
                }
                row.key == "condition" && row.kind == "builtin" -> Row(
                    modifier = Modifier.horizontalScroll(rememberScrollState()),
                    horizontalArrangement = Arrangement.spacedBy(8.dp),
                ) {
                    CONDITIONS.forEach { c ->
                        OutlinedButton(onClick = { onChange(row.copy(value = if (row.value == c) "" else c)) }) {
                            Text(if (row.value == c) "● ${c.titleCase()}" else c.titleCase())
                        }
                    }
                }
                row.optionField != null -> {
                    var options by remember(row.key) { mutableStateOf<List<OptionItem>>(emptyList()) }
                    LaunchedEffect(row.key) { options = viewModel.suggestions(row.optionField!!) }
                    SuggestField(
                        label = "Value",
                        value = row.value,
                        onValueChange = { onChange(row.copy(value = it)) },
                        options = options,
                    )
                }
                else -> OutlinedTextField(
                    value = row.value,
                    onValueChange = { onChange(row.copy(value = it)) },
                    label = { Text("Value") },
                    keyboardOptions = KeyboardOptions(
                        keyboardType = if (row.type == "number") KeyboardType.Decimal else KeyboardType.Text,
                    ),
                    singleLine = true,
                    modifier = Modifier.fillMaxWidth(),
                )
            }

            // Hard/soft and importance only exist on request fields.
            if (!seller) {
                SingleChoiceSegmentedButtonRow {
                    listOf(true to "Hard", false to "Soft").forEachIndexed { i, (hard, name) ->
                        SegmentedButton(
                            selected = row.hard == hard,
                            onClick = { onChange(row.copy(hard = hard)) },
                            shape = SegmentedButtonDefaults.itemShape(i, 2),
                        ) { Text(name) }
                    }
                }
                Text(
                    if (row.hard) "Must have" else "Importance: ${row.importance}/5",
                    style = MaterialTheme.typography.bodySmall,
                )
                Slider(
                    value = row.importance.toFloat(),
                    onValueChange = { onChange(row.copy(importance = it.toInt().coerceIn(1, 5))) },
                    valueRange = 1f..5f,
                    steps = 3,
                    enabled = !row.hard,
                )
            }
        }
    }
}

/** Text input with tap-to-fill suggestions; typing a new value adds it to the list on save. */
@Composable
private fun SuggestField(
    label: String,
    value: String,
    onValueChange: (String) -> Unit,
    options: List<OptionItem>,
) {
    Column(verticalArrangement = Arrangement.spacedBy(4.dp)) {
        OutlinedTextField(
            value = value,
            onValueChange = onValueChange,
            label = { Text(label) },
            singleLine = true,
            modifier = Modifier.fillMaxWidth(),
        )
        val matches = options
            .filter { value.isBlank() || it.key.contains(value.trim().lowercase()) }
            .filter { it.key != value.trim().lowercase() }
            .take(8)
        if (matches.isNotEmpty()) {
            Row(
                modifier = Modifier.horizontalScroll(rememberScrollState()),
                horizontalArrangement = Arrangement.spacedBy(8.dp),
            ) {
                matches.forEach {
                    SuggestionChip(onClick = { onValueChange(it.label) }, label = { Text(it.label.titleCase()) })
                }
            }
        }
        val exact = options.any { it.key == value.trim().lowercase() }
        if (value.isNotBlank() && !exact) {
            Text("New value \"${value.trim()}\" will be added", style = MaterialTheme.typography.bodySmall)
        }
    }
}

@Composable
private fun AddFieldDialog(
    saved: List<FieldDef>,
    onAdd: (label: String, type: String) -> Unit,
    onDismiss: () -> Unit,
) {
    var label by remember { mutableStateOf("") }
    var type by remember { mutableStateOf("text") }
    AlertDialog(
        onDismissRequest = onDismiss,
        title = { Text("Add field") },
        text = {
            Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                if (saved.isNotEmpty()) {
                    Text("Your saved fields", style = MaterialTheme.typography.labelLarge)
                    Row(
                        modifier = Modifier.horizontalScroll(rememberScrollState()),
                        horizontalArrangement = Arrangement.spacedBy(8.dp),
                    ) {
                        saved.forEach {
                            SuggestionChip(onClick = { onAdd(it.label, it.type) }, label = { Text(it.label) })
                        }
                    }
                }
                Text("Create new", style = MaterialTheme.typography.labelLarge)
                OutlinedTextField(
                    value = label,
                    onValueChange = { label = it },
                    label = { Text("Name") },
                    singleLine = true,
                    modifier = Modifier.fillMaxWidth(),
                )
                Text("Type", style = MaterialTheme.typography.labelLarge)
                Row(horizontalArrangement = Arrangement.spacedBy(8.dp), modifier = Modifier.fillMaxWidth()) {
                    listOf("text" to "Text", "number" to "Number", "bool" to "Yes/No").forEach { (t, name) ->
                        FilterChip(
                            selected = type == t,
                            onClick = { type = t },
                            label = {
                                Text(name, maxLines = 1, modifier = Modifier.fillMaxWidth(), textAlign = TextAlign.Center)
                            },
                            modifier = Modifier.weight(1f),
                        )
                    }
                }
            }
        },
        confirmButton = {
            TextButton(onClick = { onAdd(label, type) }, enabled = label.isNotBlank()) { Text("Add") }
        },
        dismissButton = { TextButton(onClick = onDismiss) { Text("Cancel") } },
    )
}
