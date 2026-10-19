package com.example.cpen321application.e2e

import androidx.compose.ui.test.SemanticsNodeInteraction
import androidx.compose.ui.test.hasAnyDescendant
import androidx.compose.ui.test.hasSetTextAction
import androidx.compose.ui.test.isDialog
import androidx.compose.ui.test.hasText
import androidx.compose.ui.test.junit4.AndroidComposeTestRule
import androidx.compose.ui.test.junit4.createAndroidComposeRule
import androidx.compose.ui.test.onAllNodesWithContentDescription
import androidx.compose.ui.test.onAllNodesWithText
import androidx.compose.ui.test.onFirst
import androidx.compose.ui.test.onNodeWithContentDescription
import androidx.compose.ui.test.onNodeWithText
import androidx.compose.ui.test.performClick
import androidx.compose.ui.test.performScrollTo
import androidx.compose.ui.test.performTextClearance
import androidx.compose.ui.test.performTextInput
import androidx.test.ext.junit.rules.ActivityScenarioRule
import androidx.test.platform.app.InstrumentationRegistry
import androidx.test.uiautomator.By
import androidx.test.uiautomator.UiDevice
import androidx.test.uiautomator.Until
import com.example.cpen321application.MainActivity

typealias MainRule = AndroidComposeTestRule<ActivityScenarioRule<MainActivity>, MainActivity>

const val TEST_CATEGORY = "e2e chair"
const val TEST_ADDRESS = "6335 Thunderbird Crescent, Vancouver"
private const val WAIT_MS = 15_000L

fun mainRule(): MainRule = createAndroidComposeRule<MainActivity>()

val device: UiDevice get() = UiDevice.getInstance(InstrumentationRegistry.getInstrumentation())

fun setAirplaneMode(on: Boolean) {
    device.executeShellCommand("cmd connectivity airplane-mode ${if (on) "enable" else "disable"}")
    Thread.sleep(2_000)
}

private fun SemanticsNodeInteraction.scrolled(): SemanticsNodeInteraction {
    runCatching { performScrollTo() }
    return this
}

fun MainRule.waitForText(text: String, substring: Boolean = false, ignoreCase: Boolean = false) {
    waitUntil(WAIT_MS) {
        onAllNodesWithText(text, substring = substring, ignoreCase = ignoreCase).fetchSemanticsNodes().isNotEmpty()
    }
}

fun MainRule.waitForTextGone(text: String, substring: Boolean = false, ignoreCase: Boolean = false) {
    waitUntil(WAIT_MS) {
        onAllNodesWithText(text, substring = substring, ignoreCase = ignoreCase).fetchSemanticsNodes().isEmpty()
    }
}

fun MainRule.click(text: String) {
    onNodeWithText(text).scrolled().performClick()
}

fun MainRule.field(label: String): SemanticsNodeInteraction =
    onNode(hasSetTextAction() and hasText(label)).scrolled()

fun MainRule.type(label: String, value: String) {
    field(label).performTextInput(value)
}

fun MainRule.firstValueField(): SemanticsNodeInteraction =
    onAllNodes(hasSetTextAction() and hasText("Value")).onFirst().scrolled()

fun MainRule.openMode(label: String) {
    if (onAllNodesWithText(label).fetchSemanticsNodes().isEmpty()) click("My Posts")
    click(label)
    waitForText("My ", substring = true)
}

fun MainRule.pickAddress(query: String) {
    type("Address *", query)
    waitForText("📍", substring = true)
    onAllNodesWithText("📍", substring = true).onFirst().performClick()
    waitForText("✓ Address confirmed")
}

fun MainRule.postCards(): List<*> =
    onAllNodesWithText(TEST_CATEGORY, substring = true, ignoreCase = true).fetchSemanticsNodes()

fun MainRule.createRequest(maxPrice: String = "150") {
    openMode("I'm buying")
    click("New request")
    type("Category *", TEST_CATEGORY)
    pickAddress(TEST_ADDRESS)
    firstValueField().performTextInput(maxPrice)
    click("Create request")
    waitForText("My requests (", substring = true)
}

fun MainRule.pickPhoto() {
    click("+ Add")
    val thumbnail = device.wait(Until.findObject(By.res("com.google.android.providers.media.module:id/icon_thumbnail")), WAIT_MS)
    thumbnail.click()
    device.wait(Until.findObject(By.res("com.google.android.providers.media.module:id/button_add")), WAIT_MS)?.click()
    waitForText("Photos 1/10", substring = true)
}

fun MainRule.createListing(price: String = "80") {
    openMode("I'm selling")
    click("New listing")
    type("Category *", TEST_CATEGORY)
    type("Price *", price)
    pickAddress(TEST_ADDRESS)
    pickPhoto()
    click("Create listing")
    waitForText("My listings (", substring = true)
}

fun MainRule.openFirstPostMenu() {
    onAllNodesWithContentDescription("More options").onFirst().performClick()
}

fun MainRule.backToList() {
    while (onAllNodesWithContentDescription("Back").fetchSemanticsNodes().isNotEmpty()) {
        onNodeWithContentDescription("Back").performClick()
        waitForIdle()
    }
}

fun MainRule.deleteTestPosts() {
    backToList()
    for (mode in listOf("I'm buying", "I'm selling")) {
        openMode(mode)
        waitForIdle()
        while (postCards().isNotEmpty()) {
            onAllNodesWithText(TEST_CATEGORY, substring = true, ignoreCase = true).onFirst().performClick()
            onNodeWithContentDescription("Delete").performClick()
            onNode(isDialog() and hasAnyDescendant(hasText("Delete"))).assertExists()
            onAllNodesWithText("Delete").onFirst().performClick()
            waitUntil(WAIT_MS) { onAllNodesWithText("Delete this post?").fetchSemanticsNodes().isEmpty() }
            waitForIdle()
        }
    }
}

fun MainRule.clearField(label: String) {
    field(label).performTextClearance()
}
