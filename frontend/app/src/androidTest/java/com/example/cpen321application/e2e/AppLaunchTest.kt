package com.example.cpen321application.e2e

import androidx.compose.ui.test.assertIsDisplayed
import androidx.compose.ui.test.junit4.createAndroidComposeRule
import androidx.compose.ui.test.onNodeWithText
import androidx.test.ext.junit.runners.AndroidJUnit4
import androidx.test.platform.app.InstrumentationRegistry
import androidx.test.uiautomator.UiDevice
import com.example.cpen321application.MainActivity
import org.junit.Assert.assertNotEquals
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith

/**
 * Smoke tests that prove the instrumented test tooling works end to end:
 * a Compose test against the app screen, and a UI Automator test that
 * leaves the app.
 */
@RunWith(AndroidJUnit4::class)
class AppLaunchTest {
    @get:Rule
    val composeRule = createAndroidComposeRule<MainActivity>()

    @Test
    fun mainScreenShowsLoginButton() {
        composeRule.onNodeWithText("Login + Server").assertIsDisplayed()
    }

    @Test
    fun uiAutomatorCanLeaveTheApp() {
        val device = UiDevice.getInstance(InstrumentationRegistry.getInstrumentation())
        val appPackage = InstrumentationRegistry.getInstrumentation().targetContext.packageName

        device.pressHome()
        device.waitForIdle()

        assertNotEquals(appPackage, device.currentPackageName)
    }
}
