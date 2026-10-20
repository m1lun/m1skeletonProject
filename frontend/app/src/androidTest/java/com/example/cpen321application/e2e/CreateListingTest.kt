package com.example.cpen321application.e2e

import androidx.compose.ui.test.onNodeWithText
import com.example.cpen321application.support.click
import com.example.cpen321application.support.createListing
import com.example.cpen321application.support.deleteTestPosts
import com.example.cpen321application.support.mainRule
import com.example.cpen321application.support.openMode
import com.example.cpen321application.support.pickAddress
import com.example.cpen321application.support.pickPhotoWithId
import com.example.cpen321application.support.pickPhoto
import com.example.cpen321application.support.pickPhotos
import com.example.cpen321application.support.postCards
import com.example.cpen321application.support.setAirplaneMode
import com.example.cpen321application.support.TEST_ADDRESS
import com.example.cpen321application.support.TEST_CATEGORY
import com.example.cpen321application.support.TestPhotos
import com.example.cpen321application.support.testPosts
import com.example.cpen321application.support.type
import com.example.cpen321application.support.waitForText
import org.junit.After
import org.junit.Before
import org.junit.Assert.assertTrue
import org.junit.Rule
import org.junit.Test

class CreateListingTest {
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
        assertTrue(testPosts().isEmpty())
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
        assertTrue(testPosts().isEmpty())
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
        assertTrue(testPosts().isEmpty())
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
        assertTrue(testPosts().isEmpty())
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

    @Test
    fun createsListingWithSeveralPhotos() {
        rule.openMode("I'm selling")
        rule.click("New listing")
        rule.type("Category *", TEST_CATEGORY)
        rule.type("Price *", "80")
        rule.pickAddress(TEST_ADDRESS)
        rule.pickPhotos(3)
        rule.click("Create listing")

        rule.waitForText("My listings (", substring = true)
        assertTrue(rule.postCards().size == 1)
    }

    @Test
    fun rejectsPhotoOverFiveMegabytes() {
        val oversized = photos.addOversized()
        rule.openMode("I'm selling")
        rule.click("New listing")
        rule.type("Category *", TEST_CATEGORY)
        rule.type("Price *", "80")
        rule.pickAddress(TEST_ADDRESS)
        rule.pickPhotoWithId(oversized)
        rule.click("Create listing")

        rule.waitForText("Each photo must be at most 5 MB")
        assertTrue(testPosts().isEmpty())
    }

    @Test
    fun rejectsMoreThanTenPhotos() {
        rule.openMode("I'm selling")
        rule.click("New listing")
        rule.pickPhotos(6)
        rule.pickPhotos(6, total = null)

        rule.waitForText("At most 10 photos")
        rule.waitForText("Photos 10/10", substring = true)
    }
}
