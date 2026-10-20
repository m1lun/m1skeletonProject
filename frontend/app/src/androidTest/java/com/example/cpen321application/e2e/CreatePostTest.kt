package com.example.cpen321application.e2e

import androidx.compose.ui.test.assertIsNotEnabled
import androidx.compose.ui.test.onNodeWithText
import com.example.cpen321application.support.PostForm
import com.example.cpen321application.support.TestPhotos
import com.example.cpen321application.support.click
import com.example.cpen321application.support.createPost
import com.example.cpen321application.support.deleteTestPosts
import com.example.cpen321application.support.fillForm
import com.example.cpen321application.support.mainRule
import com.example.cpen321application.support.openForm
import com.example.cpen321application.support.pickPhotoWithId
import com.example.cpen321application.support.pickPhotos
import com.example.cpen321application.support.postCards
import com.example.cpen321application.support.setAirplaneMode
import com.example.cpen321application.support.testPosts
import com.example.cpen321application.support.type
import com.example.cpen321application.support.waitForText
import org.junit.After
import org.junit.Assert.assertTrue
import org.junit.Before
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import org.junit.runners.Parameterized

@RunWith(Parameterized::class)
class CreatePostTest(private val form: PostForm) {
    companion object {
        @JvmStatic
        @Parameterized.Parameters(name = "{0}")
        fun forms() = PostForm.entries
    }

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
    fun createsPostAndShowsItInMyPosts() {
        rule.createPost(form)

        assertTrue(rule.postCards().size == 1)
    }

    @Test
    fun createsPostWithSeveralPhotos() {
        rule.openForm(form)
        rule.fillForm(form, photos = 3)
        rule.click(form.createButton)

        rule.waitForText(form.listHeader, substring = true)
        assertTrue(rule.postCards().size == 1)
    }

    @Test
    fun rejectsMissingCategory() {
        rule.openForm(form)
        rule.click(form.createButton)

        rule.waitForText("Choose a category")
        rule.onNodeWithText(form.createButton).assertExists()
    }

    @Test
    fun rejectsMissingPrice() {
        rule.openForm(form)
        rule.fillForm(form, price = null)
        rule.click(form.createButton)

        rule.waitForText(form.missingPriceError)
        assertTrue(testPosts().isEmpty())
    }

    @Test
    fun rejectsNegativePrice() {
        rule.openForm(form)
        rule.fillForm(form, price = "-5")
        rule.click(form.createButton)

        rule.waitForText(form.negativePriceError, substring = true)
        assertTrue(testPosts().isEmpty())
    }

    @Test
    fun photoIsRequiredOnlyOnListings() {
        rule.openForm(form)
        rule.fillForm(form, photos = 0)
        rule.click(form.createButton)

        val error = form.missingPhotoError
        if (error != null) {
            rule.waitForText(error)
            assertTrue(testPosts().isEmpty())
        } else {
            rule.waitForText(form.listHeader, substring = true)
            assertTrue(rule.postCards().size == 1)
        }
    }

    @Test
    fun rejectsAddressThatWasNotPicked() {
        rule.openForm(form)
        rule.fillForm(form, address = null)
        rule.type("Address *", "zzzzqqqqxxxx nowhere")
        rule.click(form.createButton)

        rule.waitForText("Choose your address from the suggestions list", substring = true)
        assertTrue(testPosts().isEmpty())
    }

    @Test
    fun showsErrorWhenServerIsUnreachable() {
        rule.openForm(form)
        rule.fillForm(form)
        setAirplaneMode(true)
        rule.click(form.createButton)

        rule.waitForText("Could not reach the server", substring = true)
        setAirplaneMode(false)
        rule.onNodeWithText(form.createButton).assertExists()
    }

    @Test
    fun rejectsPhotoOverFiveMegabytes() {
        val oversized = photos.addOversized()
        rule.openForm(form)
        rule.fillForm(form, photos = 0)
        rule.pickPhotoWithId(oversized)
        rule.click(form.createButton)

        rule.waitForText("Each photo must be at most 5 MB")
        assertTrue(testPosts().isEmpty())
    }

    @Test
    fun limitsPhotosToTen() {
        rule.openForm(form)
        rule.pickPhotos(6)
        rule.pickPhotos(6, total = 10)

        rule.onNodeWithText("+ Add").assertIsNotEnabled()
    }
}
