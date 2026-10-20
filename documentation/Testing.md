# Testing

## 1. Change History

| **Change Date**   | **Modified Sections** | **Rationale** |
| ----------------- | --------------------- | ------------- |
| _Nothing to show_ |

---

## 2. Back-end Test Specification: APIs

### 2.1. Locations of Back-end Tests and Instructions to Run Them

#### 2.1.1. Tests

| **Interface**                 | **Describe Group Location, No Mocks**                | **Describe Group Location, With Mocks**            | **Mocked Components**              |
| ----------------------------- | ---------------------------------------------------- | -------------------------------------------------- | ---------------------------------- |
| **POST /user/login**          | [`tests/no-mock/authenticationLogin.test.js#L1`](#) | [`tests/mock/authenticationLogin.test.js#L1`](#) | Google Authentication API, User DB |
| **POST /study-groups/create** | ...                                                  | ...                                                | Study Group DB                     |
| ...                           | ...                                                  | ...                                                | ...                                |
| ...                           | ...                                                  | ...                                                | ...                                |

#### 2.1.2. Commit Hash Where Tests Run

`[Insert Commit SHA here]`

#### 2.1.3. Explanation on How to Run the Tests

1. **Clone the Repository**:

   - Open your terminal and run:
     ```
     git clone https://github.com/example/your-project.git
     ```

2. **...**

### 2.2. GitHub Actions Configuration Location

`~/.github/workflows/backend-tests.yml`

### 2.3. Jest Coverage Report Screenshots With Mocks

_(Placeholder for Jest coverage screenshot with mocks enabled)_

### 2.4. Jest Coverage Report Screenshots Without Mocks

_(Placeholder for Jest coverage screenshot without mocks)_

---

## 3. Tests of Non-Functional Requirements

### 3.1. Test Locations in Git

| **Non-Functional Requirement**  | **Location in Git**                              |
| ------------------------------- | ------------------------------------------------ |
| **Performance (Response Time)** | [`backend/tests/nfr/response_time.test.js`](#) |
| **Chat Data Security**          | [`backend/tests/nfr/chat_security.test.js`](#) |

### 3.2. Test Verification and Logs

- **Performance (Response Time)**

  - **Verification:** This test suite simulates multiple concurrent API calls using Jest along with a load-testing utility to mimic real-world user behavior. The focus is on key endpoints such as user login and study group search to ensure that each call completes within the target response time of 2 seconds under normal load. The test logs capture metrics such as average response time, maximum response time, and error rates. These logs are then analyzed to identify any performance bottlenecks, ensuring the system can handle expected traffic without degradation in user experience.
  - **Log Output**
    ```
    [Placeholder for response time test logs]
    ```

- **Chat Data Security**
  - **Verification:** ...
  - **Log Output**
    ```
    [Placeholder for chat security test logs]
    ```

---

## 4. Front-end Test Specification

### 4.1. Location in Git of Front-end Test Suite:

`frontend/app/src/androidTest/java/com/example/cpen321application/e2e/`

Shared helpers (not tests) are in `frontend/app/src/androidTest/java/com/example/cpen321application/support/`.

Run with `./scripts/run-frontend-e2e-tests.sh` after signing in on the emulator. The tests use the real backend, with no mocking. Each test starts on the main screen as the signed-in user, creates the photos it needs on the device, and deletes the posts it created.

### 4.2. Tests

Feature 1: Buyer Requests and Seller Listings.

- **Use Case 1: Create Buyer Request** (`CreateRequestTest.kt`)

  - **Expected Behaviors:**
    | **Scenario Steps** | **Test Case Steps** |
    | ------------------ | ------------------- |
    | 1. The buyer opens the create-request screen. | Open "I'm buying", click "New request". |
    | 2. The app shows the request form. | Type into the "Category *" field (this fails if the form is not shown). |
    | 3. The buyer enters the requirements, an address and optional photos. | Type category "e2e chair", type the address and pick the first suggestion, enter max price 150, optionally pick 2 photos (`createsRequestWithReferencePhotos`). |
    | 4. The buyer submits the form. | Click "Create request". |
    | 5. The app shows the request in "My posts". | Check "My requests (" is shown and exactly one "e2e chair" card is listed (`createsRequestAndShowsItInMyPosts`). |
    | 3a. A required field is missing or invalid. | Submit with no category (`rejectsMissingCategory`); submit with no max price (`rejectsMissingMaxPrice`); enter max price -5 (`rejectsNegativeMaxPrice`). |
    | 3a1. The app shows an error message. | Check "Choose a category", "Max price is required" or the server's max price message is shown. For the missing max price and negative max price cases, also check no request exists on the server. |
    | 3b. A photo is larger than the limit. | Create a 5.25 MB JPEG on the device and pick it (`rejectsPhotoOverFiveMegabytes`). |
    | 3b1. The app rejects the photo and shows an error message. | Check "Each photo must be at most 5 MB" is shown and no request exists. |
    | 3c. The buyer adds more than 10 photos. | Pick 6 photos twice (`rejectsMoreThanTenPhotos`). |
    | 3c1. The app rejects the extra photos and shows an error message. | Check "At most 10 photos" and "Photos 10/10" are shown. |
    | 4a. The typed address cannot be located. | Type "zzzzqqqqxxxx nowhere", enter max price 150 and submit (`rejectsAddressThatWasNotPicked`). |
    | 4a1. The app asks the buyer to correct the address. | Check "Choose your address from the suggestions list" is shown and no request exists. |
    | 4b. The network or server is unavailable. | Turn airplane mode on and submit (`showsErrorWhenServerIsUnreachable`). |
    | 4b1. The app shows an error and creates no request. | Check "Could not reach the server" is shown and the form is still open. |

  - **Test Logs:**
    ```
    [Placeholder for instrumented test execution logs]
    ```

- **Use Case 2: Create Seller Listing** (`CreateListingTest.kt`)

  - **Expected Behaviors:**
    | **Scenario Steps** | **Test Case Steps** |
    | ------------------ | ------------------- |
    | 1. The seller opens the create-listing screen. | Open "I'm selling", click "New listing". |
    | 2. The app shows the listing form. | Type into the "Category *" and "Price *" fields (this fails if the form is not shown). |
    | 3. The seller enters the details, an address and photos. | Type category "e2e chair", price 80, pick an address suggestion, pick 1 photo (or 3 in `createsListingWithSeveralPhotos`). |
    | 4. The seller submits the form. | Click "Create listing". |
    | 5. The app shows the listing in "My posts". | Check "My listings (" is shown and exactly one "e2e chair" card is listed (`createsListingAndShowsItInMyPosts`). |
    | 3a. A required field is missing or invalid. | Submit with no category (`rejectsMissingCategory`); no price (`rejectsMissingPrice`); price -5 (`rejectsNegativePrice`); no photo (`rejectsListingWithoutPhoto`). |
    | 3a1. The app shows an error message. | Check "Choose a category", "Enter a price", the server's price message or "Add at least one photo" is shown. For all cases except the missing category, also check no listing exists on the server. |
    | 3b. A photo is larger than the limit. | Create a 5.25 MB JPEG on the device and pick it (`rejectsPhotoOverFiveMegabytes`). |
    | 3b1. The app rejects the photo and shows an error message. | Check "Each photo must be at most 5 MB" is shown and no listing exists. |
    | 3c. The seller adds more than 10 photos. | Pick 6 photos twice (`rejectsMoreThanTenPhotos`). |
    | 3c1. The app rejects the extra photos and shows an error message. | Check "At most 10 photos" and "Photos 10/10" are shown. |
    | 4a. The typed address cannot be located. | Type "zzzzqqqqxxxx nowhere", pick a photo and submit (`rejectsAddressThatWasNotPicked`). |
    | 4a1. The app asks the seller to correct the address. | Check "Choose your address from the suggestions list" is shown and no listing exists. |
    | 4b. The network or server is unavailable. | Turn airplane mode on and submit (`showsErrorWhenServerIsUnreachable`). |
    | 4b1. The app shows an error and creates no listing. | Check "Could not reach the server" is shown and the form is still open. |

  - **Test Logs:**
    ```
    [Placeholder for instrumented test execution logs]
    ```

- **Use Case 4: Manage Own Posts** (`ManagePostsTest.kt`)

  - **Expected Behaviors:**
    | **Scenario Steps** | **Test Case Steps** |
    | ------------------ | ------------------- |
    | 1. The user opens "My posts". | Create a request through the form, then open "My Posts". |
    | 2. The app shows the user's posts. | Check the "e2e chair" card is listed. |
    | 3. The user edits a post, or taps "Close". | Open the card menu, click "Edit", change max price to 175 and click "Save changes" (`editsPost`); or click "Close" then "Reopen" (`closesAndReopensPost`); or click "Delete" and confirm (`deletesPost`). |
    | 4. The app confirms the change and shows the updated post. | Open the card and check "175" is shown; check "Closed" then "Open"; check the card is gone after deleting. |
    | 2a. The user has no posts. | Open "I'm selling" on an account with no listings (`showsEmptyStateWithCreateButton`; skipped if the account has listings). |
    | 2a1. The app shows an empty state with a button to create a post. | Check "Nothing here yet." and "New listing" are shown. |
    | 3a. An edited field is invalid. | Edit the post, clear the category and click "Save changes" (`rejectsInvalidEditAndKeepsPost`). |
    | 3a1. The app shows an error and the post is unchanged. | Check "Choose a category" is shown, go back, and check exactly one "e2e chair" card is still listed. |
    | 4a. The network or server is unavailable. | Turn airplane mode on and click "Close" (`keepsPostWhenServerIsUnreachable`). |
    | 4a1. The app shows an error and the post is unchanged. | Check "Could not reach the server" is shown and the post is still "Open". |

  - **Test Logs:**
    ```
    [Placeholder for instrumented test execution logs]
    ```

### 4.3. Known Differences Between the Use Cases and the App

- Photo limit: the use cases say 10 MB; the app and backend enforce 5 MB, and the tests check 5 MB.
- A file that is not an image cannot be chosen, because the system photo picker only offers images, so scenario 3b is tested for size only.
- Unlocatable address: the app says "Choose your address from the suggestions list", not "Address not found".
- Errors appear as a message at the bottom of the screen; only the address field is highlighted.
- Success shows the saved post in "My posts" with no separate confirmation message.
- Category is free text in the app, so there is no "unknown category" error.
