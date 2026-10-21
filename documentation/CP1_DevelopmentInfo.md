# **CP1 Development Information**

1. Repository and submission version  
   

| Repository | https\://github.com/m1lun/m1skeletonProject  |
| :---- | :---- |
| Submission branch | main |
| Submission commit SHA | TODO |

   

2. Backend server  
   

| Configured public IP | 34.168.1.92  |
| :---- | :---- |
| Configured backend URL | https\://34.168.1.92:3000  |
| Domain name | (optional) |
| Health endpoint | GET https\://34.168.1.92:3000/health returns {"status":"ok"} |

   

3. Project scope requirement  
   

| Requirement | Use case | How it is implemented |
| :---- | :---- | :---- |
| Team written computational code | Matching buyer requests with seller listings  | Custom matching and ranking logic based on category, price, location, and user requirements. Implementation status to be confirmed.  |
| External API | Google Sign-In and location-based collection planning  | Google Sign-In is used for user authentication. OpenRouteService is planned for route and distance calculation. Integration status to be confirmed.  |
| App response to external events | Notify users of new offers, messages, and reservation updates  | Planned through backend events and push notifications. Implementation pending or to be verified after CP1.  |

   

4. Configuration and setup

   Frontend: Android Studio, Java 17 and Android SDK Platform 35\. Verify the submitted APK on the required Pixel 9 emulator with Android Baklava API 36\.

   Backend (only to run it yourself locally): Docker Compose 2.24+ with the supplied MongoDB 7 service. Direct execution instead requires [Node.js](http://Node.js) 22.x, npm 10+ and a running MongoDB instance.  
   

| Configuration | Value |
| :---- | :---- |
| Google Web OAuth client ID | 84981459595-fiektced5pi2ihihr18g1bh49cckka69.apps.googleusercontent.com  |
| Release signing key SHA | SHA-1 43:42:F8:9F:45:6A:5B:D6:1C:84:AF:3E:22:0D:80:F4:C9:17:30:02 |
| Additional API keys or private setup details | None |
| Android application ID | com.example.matchmarket |
| Backend port / database name | 3000/matchmarket |

Option A: use the submitted APK with the deployed back end (recommended)

1. Install CP1\_MatchMarket.apk on the Pixel 9 / API 36 emulator.  
2. Open the app and sign in with Google. It already points at https\://34.168.1.92:3000, and no other setup is needed.

Setup procedures:

1. Clone the repository and check out the submission commit recorded in Section 1\.

2. Copy backend/.env.example to backend/.env. Set GOOGLE\_CLIENT\_ID, MONGODB\_URI and MONGODB\_DB=matchmarket. Set JWT\_SECRET to a newly generated value of at least 32 characters for an independent deployment.

3. From the repository root, run docker compose up \--build \-d. Compose configures the MongoDB connection. Check that GET /health responds successfully.

4. For HTTPS, set ENABLE\_HTTPS=true and supply backend/certs/server.crt and server.key. For a different server, update the app’s trusted public certificate, network-security domain and backend URL. Follow the README HTTPS instructions.

5. Copy frontend/local.properties.example to frontend/local.properties. Set sdk.dir, API\_BASE\_URL and GOOGLE\_CLIENT\_ID. The Google client ID must match the backend value. Open frontend/ in Android Studio and sync Gradle.

6. Register the signing key’s SHA-1 for com.example.matchmarket in the same Google Cloud project as the Web OAuth client. The current release configuration defaults to the local debug keystore unless release-key settings are supplied.

7. From frontend/, run ./gradlew assembleRelease, or .\\gradlew.bat assembleRelease on Windows. Install app/build/outputs/apk/release/app-release.apk and verify it against the public backend. Submit it as CP1\_MatchMarket.apk.

	5\. Accounts and access

	Google sign-in requires an eligible Google account on the device or emulator.  
	

| TA account or sign-in instructions | Launch the application and select "Sign in with Google".  |
| :---- | :---- |
| Required credentials or allowlisting | Confirm whether the TA's Google account must be added as an authorized test user in Google Cloud.  |
| Sample data or extra access steps | Confirm whether sample buyer requests and seller listings will be preloaded for testing.  |

	  
What you can do in the app at CP1

1. **Manage posts**. In My Posts, switch between buying and selling and create a request or a listing. Set the category, address, price, condition, photos and hard or soft preferences, plus custom fields. You can edit, close, reopen and delete your posts.  
2. **Browse the feed**. It shows other users' open listings or requests, newest first, filterable by category, price range, and address plus radius.  
3. **See recommendations**. Open one of your own open posts and tap See recommendations. Matching posts from other users appear best fit first, with their distance in km.

6\. Physical device  
	

| Manufacture | TODO |
| :---- | :---- |
| Model | TODO |

	7\. Humblebrag  
	…

	8\. Limitations

- Offers, interests, reservations and live updates are not implemented yet (planned for CP2).  
- Travel time is not connected to a routing service yet, so it is never shown.  
- Address search uses Android's built-in Geocoder, which needs a network connection.