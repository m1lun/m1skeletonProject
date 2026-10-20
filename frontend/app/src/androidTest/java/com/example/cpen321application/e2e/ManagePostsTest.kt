package com.example.cpen321application.e2e

import androidx.compose.ui.test.onAllNodesWithText
import androidx.compose.ui.test.onFirst
import androidx.compose.ui.test.onNodeWithText
import androidx.compose.ui.test.performClick
import androidx.compose.ui.test.performTextReplacement
import com.example.cpen321application.support.back
import com.example.cpen321application.support.clearField
import com.example.cpen321application.support.click
import com.example.cpen321application.support.createPost
import com.example.cpen321application.support.deleteTestPosts
import com.example.cpen321application.support.firstValueField
import com.example.cpen321application.support.mainRule
import com.example.cpen321application.support.openFirstPostMenu
import com.example.cpen321application.support.postCards
import com.example.cpen321application.support.setAirplaneMode
import com.example.cpen321application.support.TEST_CATEGORY
import com.example.cpen321application.support.PostForm
import com.example.cpen321application.support.TestPhotos
import com.example.cpen321application.support.waitForText
import org.junit.After
import org.junit.Before
import org.junit.Assert.assertTrue
import org.junit.Rule
import org.junit.Test

class ManagePostsTest {
    @get:Rule
    val photos = TestPhotos()

    @get:Rule
    val rule = mainRule()

    @Before
    fun removeLeftovers() {
        deleteTestPosts()
    }

    @After
    fun cleanUp() {
        setAirplaneMode(false)
        deleteTestPosts()
    }

    @Test
    fun editsPost() {
        rule.createPost(PostForm.REQUEST)
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
        rule.createPost(PostForm.REQUEST)
        rule.openFirstPostMenu()
        rule.onNodeWithText("Edit").performClick()
        rule.waitForText("Edit request")
        rule.clearField("Category *")
        rule.click("Save changes")

        rule.waitForText("Choose a category")
        rule.back()
        rule.waitForText("My requests (", substring = true)
        assertTrue(rule.postCards().size == 1)
    }

    @Test
    fun closesAndReopensPost() {
        rule.createPost(PostForm.REQUEST)

        rule.openFirstPostMenu()
        rule.onNodeWithText("Close").performClick()
        rule.waitForText("Closed")

        rule.openFirstPostMenu()
        rule.onNodeWithText("Reopen").performClick()
        rule.waitForText("Open")
    }

    @Test
    fun deletesPost() {
        rule.createPost(PostForm.REQUEST)
        rule.openFirstPostMenu()
        rule.onNodeWithText("Delete").performClick()
        rule.onAllNodesWithText("Delete").onFirst().performClick()

        rule.waitUntil(15_000) { rule.postCards().isEmpty() }
    }

    @Test
    fun keepsPostWhenServerIsUnreachable() {
        rule.createPost(PostForm.REQUEST)
        setAirplaneMode(true)
        rule.openFirstPostMenu()
        rule.onNodeWithText("Close").performClick()

        rule.waitForText("Could not reach the server", substring = true)
        setAirplaneMode(false)
        rule.waitForText("Open")
    }
}
