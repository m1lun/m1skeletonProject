package com.example.cpen321application.e2e

import androidx.compose.ui.test.onAllNodesWithText
import androidx.compose.ui.test.onFirst
import androidx.compose.ui.test.onNodeWithText
import androidx.compose.ui.test.performClick
import androidx.compose.ui.test.performTextReplacement
import org.junit.After
import org.junit.Assert.assertTrue
import org.junit.Assume.assumeTrue
import org.junit.Rule
import org.junit.Test

class ManagePostsTest {
    @get:Rule
    val rule = mainRule()

    @After
    fun cleanUp() {
        setAirplaneMode(false)
        rule.deleteTestPosts()
    }

    @Test
    fun showsEmptyStateWithCreateButton() {
        rule.openMode("I'm selling")
        assumeTrue(rule.onAllNodesWithText("My listings (0)").fetchSemanticsNodes().isNotEmpty())

        rule.onNodeWithText("Nothing here yet.", substring = true).assertExists()
        rule.onNodeWithText("New listing").assertExists()
    }

    @Test
    fun editsPost() {
        rule.createRequest()
        rule.openFirstPostMenu()
        rule.onNodeWithText("Edit").performClick()
        rule.waitForText("Edit request")
        rule.firstValueField().performTextReplacement("175")
        rule.click("Save changes")

        rule.waitForText("My requests (", substring = true)
        rule.onAllNodesWithText(TEST_CATEGORY, substring = true, ignoreCase = true).onFirst().performClick()
        rule.waitForText("175", substring = true)
    }

    @Test
    fun rejectsInvalidEditAndKeepsPost() {
        rule.createRequest()
        rule.openFirstPostMenu()
        rule.onNodeWithText("Edit").performClick()
        rule.waitForText("Edit request")
        rule.clearField("Category *")
        rule.click("Save changes")

        rule.waitForText("Choose a category")
        rule.click("Back")
        rule.waitForText("My requests (", substring = true)
        assertTrue(rule.postCards().size == 1)
    }

    @Test
    fun closesAndReopensPost() {
        rule.createRequest()

        rule.openFirstPostMenu()
        rule.onNodeWithText("Close").performClick()
        rule.waitForText("Closed")

        rule.openFirstPostMenu()
        rule.onNodeWithText("Reopen").performClick()
        rule.waitForText("Open")
    }

    @Test
    fun deletesPost() {
        rule.createRequest()
        rule.openFirstPostMenu()
        rule.onNodeWithText("Delete").performClick()
        rule.onAllNodesWithText("Delete").onFirst().performClick()

        rule.waitUntil(15_000) { rule.postCards().isEmpty() }
    }

    @Test
    fun keepsPostWhenServerIsUnreachable() {
        rule.createRequest()
        setAirplaneMode(true)
        rule.openFirstPostMenu()
        rule.onNodeWithText("Close").performClick()

        rule.waitForText("Could not reach the server", substring = true)
        setAirplaneMode(false)
        rule.waitForText("Open")
    }
}
