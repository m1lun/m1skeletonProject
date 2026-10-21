# Testing

## 1. Change History

| **Change Date** | **Modified Sections** | **Rationale** |
| --------------- | --------------------- | ------------- |
| 2026-10-20 | 2 | First version: the front-end end-to-end tests for Feature 1 (Use Cases 1, 2 and 4), how to run them, how each test maps to its use case scenario steps, and the logs of a full run (25/25 passed). Back-end and non-functional requirement tests will be added later. |

---

## 2. Front-end Test Specification

### 2.1. Location in Git of Front-end Test Suite:

`frontend/app/src/androidTest/java/com/example/cpen321application/e2e/`

| **Test class** | **Use cases** |
| -------------- | ------------- |
| [`CreatePostTest.kt`](../frontend/app/src/androidTest/java/com/example/cpen321application/e2e/CreatePostTest.kt) | [Use Case 1: Create Buyer Request](Requirements_and_Design.md#uc1), [Use Case 2: Create Seller Listing](Requirements_and_Design.md#uc2) |
| [`ManagePostsTest.kt`](../frontend/app/src/androidTest/java/com/example/cpen321application/e2e/ManagePostsTest.kt) | [Use Case 4: Manage Own Posts](Requirements_and_Design.md#uc4) |

Shared test steps are in `support/PostRobot.kt`, and the differences between the request and listing forms are in `support/PostForm.kt`.

**How the tests are set up.** Following the course rules, each test starts from the app's main screen with the user already signed in, and assumes no existing data:

- **Stand-alone tests.** Every post a test creates uses the category `e2e chair`. Before and after each test, `deleteTestPosts()` deletes every post in that category through the back-end API, so each test starts from an empty state and a failed test leaves nothing behind. The tester's posts in other categories are never touched. Tests that need an existing post create it through the UI first (`createPost`).
- **One test class for both post types.** Use Cases 1 and 2 share the same form, so `CreatePostTest` is parameterized over `PostForm` and runs every test once for requests (`[REQUEST]`) and once for listings (`[LISTING]`).
- **No mocking.** The tests talk to the real back-end. For failure scenario 4b ("the network or server is unavailable"), the test switches on the emulator's airplane mode, and switches it off again in `@After` even if the test fails.
- **Results checked on the server.** When a scenario says nothing is saved, the test asks the back-end with `testPosts()` and checks the list is empty, instead of trusting the screen.
- **System UI.** The Android photo picker is not part of the app, so it is driven with UI Automator. `TestPhotos` adds small JPEGs to the emulator's gallery before each test and deletes them afterwards.

**How to run them.**

1. Complete the Frontend Setup and the `backend/.env` part of the Backend Setup in the [README](../README.md). Docker must be running, and `java` must be on your `PATH`. Android Studio's bundled JDK works:
   ```bash
   export JAVA_HOME="/Applications/Android Studio.app/Contents/jbr/Contents/Home"   # macOS
   export PATH="$JAVA_HOME/bin:$PATH"
   ```
2. In `frontend/local.properties`, set `API_BASE_URL=http://10.0.2.2:3000` so the app uses the back-end the script starts on your machine.
3. From the project root, run:
   ```bash
   ./scripts/run-frontend-e2e-tests.sh        # Windows: scripts\run-frontend-e2e-tests.ps1
   ```
   The script starts the back-end and the `Pixel_9` emulator (set `AVD_NAME=<name>` for another AVD), then builds and installs the app. When prompted, sign in inside the app on the emulator, wait for the main screen, and press Enter. The full suite takes about 5 minutes.
4. The report is at `frontend/app/build/reports/androidTests/connected/debug/index.html`.

To rerun one test once the back-end is up and the app is signed in:
```bash
cd frontend
./gradlew connectedDebugAndroidTest \
  -Pandroid.testInstrumentationRunnerArguments.class=com.example.cpen321application.e2e.ManagePostsTest#editsPost
```

**Troubleshooting.**
- If every test fails with "Your session has expired. Sign in again.", the app is signed out: sign in on the emulator again and rerun.
- If Google sign-in fails on the emulator, it has probably lost DNS, which can happen when the host changes network or wakes from sleep. `adb shell ping -c1 google.com` reports `unknown host` when that is the cause. Cold boot the emulator (Device Manager → ⋮ → Cold Boot Now).

### 2.2. Tests

- **Use Cases 1 and 2: Create Buyer Request / Create Seller Listing** ([`CreatePostTest.kt`](../frontend/app/src/androidTest/java/com/example/cpen321application/e2e/CreatePostTest.kt), each test runs for both forms)

  - **Expected Behaviors:**

    | **Scenario Steps** | **Test Case Steps** |
    | ------------------ | ------------------- |
    | 1. The buyer/seller opens the create-request/create-listing screen. | Tap "My Posts", then "I'm buying" (request) or "I'm selling" (listing).<br>Tap "New request" or "New listing". |
    | 2. The app shows the request/listing form. | Check that the "Category \*" field is present on screen. |
    | 3. The buyer/seller enters the fields and a typed address, and adds photos (optional for requests). | Input "e2e chair" in "Category \*".<br>Input "6335 Thunderbird Crescent, Vancouver" in "Address \*", tap the first suggestion, and check that "✓ Address confirmed" is shown.<br>Input "150" as the maximum price (request) or in "Price \*" (listing).<br>Listing only: tap "+ Add", select one photo in the system photo picker, tap "Done", and check that "Photos 1/10" is shown. |
    | 4. The buyer/seller submits the form. | Tap "Create request" or "Create listing". |
    | 5. The app confirms the post was saved and shows it in "My posts". | Check that the "My requests (" or "My listings (" header is shown.<br>Check that exactly one post with the category "e2e chair" is listed.<br>(`createsPostAndShowsItInMyPosts`; `createsPostWithSeveralPhotos` repeats steps 1-5 with three photos.) |
    | 3a. A required field is missing or invalid. | **Missing category** (`rejectsMissingCategory`): open the form and tap "Create request"/"Create listing" without filling it.<br>**Missing price** (`rejectsMissingPrice`): fill everything except the price and submit.<br>**Negative price** (`rejectsNegativePrice`): fill the form with the price "-5" and submit.<br>**Missing photo** (`photoIsRequiredOnlyOnListings`): fill the form without a photo and submit. |
    | 3a1. The app shows an error message. | **Missing category:** check that "Choose a category" is shown and the create button is still on screen.<br>**Missing price:** check that "Max price is required" (request) or "Enter a price" (listing) is shown and the back-end has no test posts.<br>**Negative price:** check that the error ("at least 0" for requests, "price must be" for listings) is shown and the back-end has no test posts.<br>**Missing photo:** for listings, check that "Add at least one photo" is shown and the back-end has no test posts; for requests, where photos are optional, check that the request is saved and listed. |
    | 3b. A photo is too large. | (`rejectsPhotoOverFiveMegabytes`) Add an oversized JPEG to the gallery. Fill the form without photos, select that photo in the photo picker, and submit. |
    | 3b1. The app rejects the photo and shows an error message. | Check that "Each photo must be at most 5 MB" is shown and the back-end has no test posts. |
    | 3c. The user adds more than 10 photos. | (`limitsPhotosToTen`) Open the form, select 6 photos in the photo picker, then try to select 6 more. |
    | 3c1. The app rejects the extra photos. | Check that "Photos 10/10" is shown and the "+ Add" button is disabled. |
    | 4a. The typed address cannot be located. | (`rejectsAddressThatWasNotPicked`) Fill the form without picking an address, input "zzzzqqqqxxxx nowhere" in "Address \*", and submit. |
    | 4a1. The app asks the user to correct the address. | Check that "Choose your address from the suggestions list" is shown and the back-end has no test posts. |
    | 4b. The network or server is unavailable. | (`showsErrorWhenServerIsUnreachable`) Fill the form, turn on airplane mode, and submit. |
    | 4b1. The app shows an error message; no post is created. | Check that "Could not reach the server" is shown.<br>Turn off airplane mode and check that the form, with its create button, is still on screen. |

  - **Test Logs:**
    ```
    Pixel_9(AVD) - 16 (Android 16, API 36), 2026-10-20, ./scripts/run-frontend-e2e-tests.sh
    Branch fix/e2e-photo-picker-order (main + PR #56), commit 4f8635e

    com.example.cpen321application.e2e.CreatePostTest
      rejectsMissingPrice[REQUEST]                  PASSED   9.97 s
      rejectsAddressThatWasNotPicked[REQUEST]       PASSED   5.95 s
      createsPostAndShowsItInMyPosts[REQUEST]       PASSED   6.64 s
      showsErrorWhenServerIsUnreachable[REQUEST]    PASSED  10.82 s
      rejectsMissingCategory[REQUEST]               PASSED   5.10 s
      limitsPhotosToTen[REQUEST]                    PASSED  10.39 s
      rejectsNegativePrice[REQUEST]                 PASSED  16.52 s
      createsPostWithSeveralPhotos[REQUEST]         PASSED   8.69 s
      photoIsRequiredOnlyOnListings[REQUEST]        PASSED   6.41 s
      rejectsPhotoOverFiveMegabytes[REQUEST]        PASSED   9.38 s
      rejectsMissingPrice[LISTING]                  PASSED   8.16 s
      rejectsAddressThatWasNotPicked[LISTING]       PASSED   7.86 s
      createsPostAndShowsItInMyPosts[LISTING]       PASSED   8.36 s
      showsErrorWhenServerIsUnreachable[LISTING]    PASSED  12.61 s
      rejectsMissingCategory[LISTING]               PASSED   5.06 s
      limitsPhotosToTen[LISTING]                    PASSED  10.40 s
      rejectsNegativePrice[LISTING]                 PASSED  10.52 s
      createsPostWithSeveralPhotos[LISTING]         PASSED   8.21 s
      photoIsRequiredOnlyOnListings[LISTING]        PASSED   6.21 s
      rejectsPhotoOverFiveMegabytes[LISTING]        PASSED   9.29 s

    CreatePostTest: 20 tests, 20 passed, 0 failed, 0 skipped
    ```

- **Use Case 4: Manage Own Posts** ([`ManagePostsTest.kt`](../frontend/app/src/androidTest/java/com/example/cpen321application/e2e/ManagePostsTest.kt))

  - **Expected Behaviors:**

    | **Scenario Steps** | **Test Case Steps** |
    | ------------------ | ------------------- |
    | 1. The user opens "My posts". | Create a request with the category "e2e chair" through the UI (Use Case 1, steps 1-5). The app ends on "My posts". |
    | 2. The app shows the user's requests and listings. | Check that the "My requests (" header is shown with the new request. |
    | 3. The user selects a post and edits its fields, or taps "Close". | **Edit** (`editsPost`): tap "More options" on the post, tap "Edit", check that "Edit request" is shown, replace the maximum price with "175", and tap "Save changes".<br>**Close** (`closesAndReopensPost`): tap "More options" on the post and tap "Close".<br>**Delete** (`deletesPost`): tap "More options" on the post, tap "Delete", and confirm "Delete". |
    | 4. The app confirms the change and shows the updated post. | **Edit:** check that "My requests (" is shown, tap the post, and check that "175" is shown.<br>**Close:** check that the post shows "Closed". Tap "More options", tap "Reopen", and check that it shows "Open".<br>**Delete:** check that no "e2e chair" post is listed. |
    | 3a. An edited field is invalid. | (`rejectsInvalidEditAndKeepsPost`) Tap "More options" on the post, tap "Edit", clear "Category \*", and tap "Save changes". |
    | 3a1. The app shows an error message; the post is unchanged. | Check that "Choose a category" is shown.<br>Tap "Back" and check that "My requests (" still lists exactly one "e2e chair" post. |
    | 4a. The network or server is unavailable. | (`keepsPostWhenServerIsUnreachable`) Turn on airplane mode, tap "More options" on the post, and tap "Close". |
    | 4a1. The app shows an error message; the post is unchanged. | Check that "Could not reach the server" is shown.<br>Turn off airplane mode and check that the post still shows "Open". |

  - **Test Logs:**
    ```
    Pixel_9(AVD) - 16 (Android 16, API 36), 2026-10-20, ./scripts/run-frontend-e2e-tests.sh
    Branch fix/e2e-photo-picker-order (main + PR #56), commit 4f8635e

    com.example.cpen321application.e2e.ManagePostsTest
      editsPost                                     PASSED   6.80 s
      deletesPost                                   PASSED   6.93 s
      keepsPostWhenServerIsUnreachable              PASSED  10.96 s
      rejectsInvalidEditAndKeepsPost                PASSED  17.79 s
      closesAndReopensPost                          PASSED   6.82 s

    ManagePostsTest: 5 tests, 5 passed, 0 failed, 0 skipped

    Finished 25 tests on Pixel_9(AVD) - 16
    BUILD SUCCESSFUL in 3m 52s
    ```
