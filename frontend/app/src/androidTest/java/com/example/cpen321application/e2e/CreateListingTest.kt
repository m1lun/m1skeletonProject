package com.example.cpen321application.e2e

import androidx.compose.ui.test.onNodeWithText
import org.junit.After
import org.junit.Assert.assertTrue
import org.junit.Rule
import org.junit.Test

class CreateListingTest {
    @get:Rule
    val rule = mainRule()

    @After
    fun cleanUp() {
        setAirplaneMode(false)
        rule.deleteTestPosts()
    }

    @Test
    fun createsListingAndShowsItInMyPosts() {
        rule.createListing()

        rule.waitForText("My listings (", substring = true)
        assertTrue(rule.postCards().size == 1)
    }

    @Test
    fun rejectsMissingCategory() {
        rule.openMode("I'm selling")
        rule.click("New listing")
        rule.click("Create listing")

        rule.waitForText("Choose a category")
    }

    @Test
    fun rejectsMissingPrice() {
        rule.openMode("I'm selling")
        rule.click("New listing")
        rule.type("Category *", TEST_CATEGORY)
        rule.pickAddress(TEST_ADDRESS)
        rule.pickPhoto()
        rule.click("Create listing")

        rule.waitForText("Enter a price")
        assertTrue(rule.postCards().isEmpty())
    }

    @Test
    fun rejectsNegativePrice() {
        rule.openMode("I'm selling")
        rule.click("New listing")
        rule.type("Category *", TEST_CATEGORY)
        rule.type("Price *", "-5")
        rule.pickAddress(TEST_ADDRESS)
        rule.pickPhoto()
        rule.click("Create listing")

        rule.waitForText("price must be", substring = true)
        assertTrue(rule.postCards().isEmpty())
    }

    @Test
    fun rejectsListingWithoutPhoto() {
        rule.openMode("I'm selling")
        rule.click("New listing")
        rule.type("Category *", TEST_CATEGORY)
        rule.type("Price *", "80")
        rule.pickAddress(TEST_ADDRESS)
        rule.click("Create listing")

        rule.waitForText("Add at least one photo")
        assertTrue(rule.postCards().isEmpty())
    }

    @Test
    fun rejectsAddressThatWasNotPicked() {
        rule.openMode("I'm selling")
        rule.click("New listing")
        rule.type("Category *", TEST_CATEGORY)
        rule.type("Price *", "80")
        rule.type("Address *", "zzzzqqqqxxxx nowhere")
        rule.pickPhoto()
        rule.click("Create listing")

        rule.waitForText("Choose your address from the suggestions list", substring = true)
        assertTrue(rule.postCards().isEmpty())
    }

    @Test
    fun showsErrorWhenServerIsUnreachable() {
        rule.openMode("I'm selling")
        rule.click("New listing")
        rule.type("Category *", TEST_CATEGORY)
        rule.type("Price *", "80")
        rule.pickAddress(TEST_ADDRESS)
        rule.pickPhoto()
        setAirplaneMode(true)
        rule.click("Create listing")

        rule.waitForText("Could not reach the server", substring = true)
        setAirplaneMode(false)
        rule.onNodeWithText("Create listing").assertExists()
    }
}
