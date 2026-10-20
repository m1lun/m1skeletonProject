package com.example.cpen321application.e2e

import androidx.compose.ui.test.hasSetTextAction
import androidx.compose.ui.test.hasText
import androidx.compose.ui.test.onNodeWithText
import androidx.compose.ui.test.performTextInput
import com.example.cpen321application.support.click
import com.example.cpen321application.support.createRequest
import com.example.cpen321application.support.deleteTestPosts
import com.example.cpen321application.support.firstValueField
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

class CreateRequestTest {
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
        assertTrue(testPosts().isEmpty())
    }

    @Test
    fun rejectsNegativeMaxPrice() {
        rule.openMode("I'm buying")
        rule.click("New request")
        rule.type("Category *", TEST_CATEGORY)
        rule.pickAddress(TEST_ADDRESS)
        rule.firstValueField().performTextInput("-5")
        rule.click("Create request")

        rule.waitForText("at least 0", substring = true)
        assertTrue(testPosts().isEmpty())
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
        assertTrue(testPosts().isEmpty())
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

    @Test
    fun createsRequestWithReferencePhotos() {
        rule.openMode("I'm buying")
        rule.click("New request")
        rule.type("Category *", TEST_CATEGORY)
        rule.pickAddress(TEST_ADDRESS)
        rule.firstValueField().performTextInput("150")
        rule.pickPhotos(2)
        rule.click("Create request")

        rule.waitForText("My requests (", substring = true)
        assertTrue(rule.postCards().size == 1)
    }

    @Test
    fun rejectsPhotoOverFiveMegabytes() {
        val oversized = photos.addOversized()
        rule.openMode("I'm buying")
        rule.click("New request")
        rule.type("Category *", TEST_CATEGORY)
        rule.pickAddress(TEST_ADDRESS)
        rule.firstValueField().performTextInput("150")
        rule.pickPhotoWithId(oversized)
        rule.click("Create request")

        rule.waitForText("Each photo must be at most 5 MB")
        assertTrue(testPosts().isEmpty())
    }

    @Test
    fun rejectsMoreThanTenPhotos() {
        rule.openMode("I'm buying")
        rule.click("New request")
        rule.pickPhotos(6)
        rule.pickPhotos(6, total = null)

        rule.waitForText("At most 10 photos")
        rule.waitForText("Photos 10/10", substring = true)
    }
}
