package com.example.cpen321application.e2e

import androidx.compose.ui.test.hasSetTextAction
import androidx.compose.ui.test.hasText
import androidx.compose.ui.test.onNodeWithText
import androidx.compose.ui.test.performTextInput
import org.junit.After
import org.junit.Assert.assertTrue
import org.junit.Rule
import org.junit.Test

class CreateRequestTest {
    @get:Rule
    val rule = mainRule()

    @After
    fun cleanUp() {
        setAirplaneMode(false)
        rule.deleteTestPosts()
    }

    @Test
    fun createsRequestAndShowsItInMyPosts() {
        rule.createRequest()

        rule.waitForText("My requests (", substring = true)
        assertTrue(rule.postCards().size == 1)
    }

    @Test
    fun rejectsMissingCategory() {
        rule.openMode("I'm buying")
        rule.click("New request")
        rule.click("Create request")

        rule.waitForText("Choose a category")
        rule.onNodeWithText("Create request").assertExists()
    }

    @Test
    fun rejectsMissingMaxPrice() {
        rule.openMode("I'm buying")
        rule.click("New request")
        rule.type("Category *", TEST_CATEGORY)
        rule.pickAddress(TEST_ADDRESS)
        rule.click("Create request")

        rule.waitForText("Max price is required")
        assertTrue(rule.postCards().isEmpty())
    }

    @Test
    fun rejectsNegativeMaxPrice() {
        rule.openMode("I'm buying")
        rule.click("New request")
        rule.type("Category *", TEST_CATEGORY)
        rule.pickAddress(TEST_ADDRESS)
        rule.firstValueField().performTextInput("-5")
        rule.click("Create request")

        rule.waitForText("max price", substring = true, ignoreCase = true)
        assertTrue(rule.postCards().isEmpty())
    }

    @Test
    fun rejectsAddressThatWasNotPicked() {
        rule.openMode("I'm buying")
        rule.click("New request")
        rule.type("Category *", TEST_CATEGORY)
        rule.type("Address *", "zzzzqqqqxxxx nowhere")
        rule.firstValueField().performTextInput("150")
        rule.click("Create request")

        rule.waitForText("Choose your address from the suggestions list", substring = true)
        assertTrue(rule.postCards().isEmpty())
    }

    @Test
    fun showsErrorWhenServerIsUnreachable() {
        rule.openMode("I'm buying")
        rule.click("New request")
        rule.type("Category *", TEST_CATEGORY)
        rule.pickAddress(TEST_ADDRESS)
        rule.firstValueField().performTextInput("150")
        setAirplaneMode(true)
        rule.click("Create request")

        rule.waitForText("Could not reach the server", substring = true)
        setAirplaneMode(false)
        rule.onNode(hasSetTextAction() and hasText("Category *")).assertExists()
    }
}
