# **CP1 Code Review**

Repository:  [m1lun/m1skeletonProject](https://github.com/m1lun/m1skeletonProject)  
Inspected main commit: [8a3850283ffd18ab7460812eca31803d685cabd6](https://github.com/m1lun/m1skeletonProject/commit/8a3850283ffd18ab7460812eca31803d685cabd6)   
Evidence checked: 20 October 2026, Vancouver time.

1. **Change History**  
   

| Date | Sections | Rationale |
| :---- | :---- | :---- |
| 2026-10-19 | 1 to 3 | Prepared the CP1 status report from GitHub PR and Codacy evidence. |
| 2026-10-19 | 1 to 3 | Integrated GitHub Code\_Review.md template fields and review rubric; removed duplicated draft text; refreshed PR merge status while retaining the original review evidence. |
| 2026-10-20 | 2 and 3 | Updated PR and review evidence through PR \#56; corrected the PR \#41 label; distinguished historical tests from current main; recorded outstanding evidence and documentation gaps. |

   

2. **Automated Code Review Results**  
   Codacy’s GitHub bot summaries for the pull requests below report “0 new issues.” These are pull-request-level observations; they do not establish that the entire repository has zero unresolved issues or that Codacy completed analysis on the final CP1 submission commit..  
     
   **2.1	Commit Hash Where Codacy Ran**

   Example recorded in the original document: PR \#38, commit fb93124ade8792de5d53a5f43bafc7998f0da6f8. The SHA column below reproduces the values in the supplied draft; for PR \#35, the branch head subsequently advanced.

| PR | SHA (in draft) | Codacy PR summary | Verified PR status  |
| :---- | :---- | :---- | :---- |
| [\#35](https://github.com/m1lun/m1skeletonProject/pull/35)  | 1e7b7f6 | 0 new issues | Merged to main; source SHA predates its final PR head |
| [\#37](https://github.com/m1lun/m1skeletonProject/pull/37) | 5735ddb | 0 new issues | Merged to main |
| [\#38](https://github.com/m1lun/m1skeletonProject/pull/38) | fb93124 | 0 new issues | Merged to main |
| [\#39](https://github.com/m1lun/m1skeletonProject/pull/39) | fbf10d3 | 0 new issues | Merged to feat/posts-viewmodel |
| [\#40](https://github.com/m1lun/m1skeletonProject/pull/40) | ac79360 | 0 new issues | Merged to feat/posts-list-detail |
| [\#41](https://github.com/m1lun/m1skeletonProject/pull/41) | 9676968 | 0 new issues | Merged to feat/posts-editor |
| [\#42](https://github.com/m1lun/m1skeletonProject/pull/42) | 0967c66 | 0 new issues | Merged to main (was open in original draft) |
| [\#43](https://github.com/m1lun/m1skeletonProject/pull/43) | f017bc8 | 0 new issues | Merged to main |
| [\#45](https://github.com/m1lun/m1skeletonProject/pull/45) | 9676968 | 0 new issues | Merged to main |
| [\#46](https://github.com/m1lun/m1skeletonProject/pull/46) | 23ffb79 | 0 new issues | Merged to main |
| [\#47](https://github.com/m1lun/m1skeletonProject/pull/47) | 4e2d98d | 0 new issues | Merged to main |
| [\#48](https://github.com/m1lun/m1skeletonProject/pull/48) | c113c0c | 0 new issues | Merged to main |
| [\#51](https://github.com/m1lun/m1skeletonProject/pull/51) | 5df76b9 | 0 new issues | Merged to main |
| [\#52](https://github.com/m1lun/m1skeletonProject/pull/52) | a3cbbdf | 0 new issues | Merged to main |
| [\#53](https://github.com/m1lun/m1skeletonProject/pull/53) | f3f2e8f | 0 new issues | Merged to main |
| [\#54](https://github.com/m1lun/m1skeletonProject/pull/54) | 3961584 | 0 new issues | Merged to main |
| [\#55](https://github.com/m1lun/m1skeletonProject/pull/55) | 749a7f6 | 0 new issues | Open |
| [\#56](https://github.com/m1lun/m1skeletonProject/pull/56) | 5fe01e0 | 0 new issues | Merged to main |

   **2.2**	**Unfixed Issues per Codacy Category**

   The Codacy bot summaries for the recorded pull requests reported 0 new issues. However, these results do not provide a repository-wide breakdown of outstanding issues by category. Therefore, the total number of remaining issues in each Codacy category has not been verified.

   

**2.3	Unfixed Issues per Codacy Code Pattern**  
The available Codacy PR summaries do not provide a complete breakdown of unresolved issues by code pattern. Consequently, repository-wide outstanding issue counts for individual code patterns cannot be confirmed from the available evidence.

**2.4	Justifications for Unfixed Issues**  
As the repository-wide outstanding issue inventory has not been verified, no specific unresolved Codacy issues can be documented or justified in this section. The absence of recorded justifications should not be interpreted as confirmation that no outstanding issues exist.

**2.5	Recorded Responses to Automated Findings**  
PR \#51 documents several changes addressing automated analysis findings:

* **TypeScript**: Addressed two no-unsafe-argument findings related to uploaded files by introducing a local UploadedFile type.  
* **Dependencies**: Updated proxy-addr from 2.0.7 to 2.0.8 and qs from 6.15.3 to 6.16.1 in response to dependency alerts.  
* **Kotlin**: Simplified PostViewModel by removing the updateRow and removeRow wrappers to address the detekt function-count limit.

  The final [Codacy bot summary](https://github.com/m1lun/m1skeletonProject/pull/51#issuecomment-6285991873) for [PR \#51](https://github.com/m1lun/m1skeletonProject/pull/51) reported 0 new issues. This result applies to the PR analysis and does not establish that the entire repository is free of outstanding issues.

3. **Manual Code Review Results**  
   Formal peer review is planned for the later checkpoints. Code exchange is scheduled for CP2, and the review results will be documented at CP3.  
   

3.1.	**Review Performed by Our Group**  
Our group has not yet performed the formal review of another group’s project. The reviewed group, commit SHA, exchange date and review report will be recorded when completed.

3.2.	**Review Received by Our Group**  
Our group has not yet received a formal peer-review report. The reviewing group, reviewed commit SHA and feedback will be recorded when available.

| Type | Criterion | Performed | Received |
| :---- | :---- | :---- | :---- |
| Manual code review | Maintainable code, clear names, appropriate method size, efficiency and error handling | N/A – CP1 | N/A – CP1 |
| Manual test review | API / core-feature coverage; edge cases; correct assertions | N/A – CP1 | N/A – CP1 |
| Manual test review | Well-structured, maintainable test code | N/A – CP1 | N/A – CP1 |
| Manual test review | Tests match requirements and design | N/A – CP1 | N/A – CP1 |
| Manual test review | Non-functional requirements are properly tested | N/A – CP1 | N/A – CP1 |
| Manual test review | Coverage targets and justifications for uncovered code | N/A – CP1 | N/A – CP1 |
| Manual test review | Backend tests can be run automatically | N/A – CP1 | N/A – CP1 |
| Automated code review | Codacy configured according to project requirements | N/A – CP1 | N/A – CP1 |
| Automated code review | Remaining Codacy issues appropriately justified | N/A – CP1 | N/A – CP1 |

3.3	**Actions Taken in Response to the Review**  
No actions have been taken in response to formal peer review, as feedback has not yet been received. Any resulting changes and unresolved findings will be documented after the review.

	3.4	**Additional Internal Team Review**

| PR | Activity and status |
| :---- | :---- |
| [PR \#29](https://github.com/m1lun/m1skeletonProject/pull/29#issuecomment-6185268836)  | Nishim12 requested backend-issued session and refresh tokens. Bwong99 later summarized token issuance, refresh/logout endpoints and protected routes. PR merged.  |
| [PR \#31](https://github.com/m1lun/m1skeletonProject/pull/31#discussion_r4300167547)  | Nishim12 submitted a COMMENTED review requesting removal of a comment in backend/src/models/common.ts. The thread is resolved and outdated. Nishim12 is also the PR author, so this is recorded as author self-review, not independent teammate review. PR merged. |
| [PR \#35](https://github.com/m1lun/m1skeletonProject/pull/35) | Nishim12 requested comment cleanup in the listings-feed work and later wrote “Thanks for fixing the comments. LGTM\!” PR merged. |
| [PR \#46](https://github.com/m1lun/m1skeletonProject/pull/46#pullrequestreview-5579959981) | m1lun submitted a COMMENTED review thanking the author for removing unit tests and stating LGTM. This records a review comment, not an APPROVED review or evidence of test completeness. PR merged. |
| [PR \#53](https://github.com/m1lun/m1skeletonProject/pull/53#pullrequestreview-5593076708) | m1lun submitted a COMMENTED review stating that one function had been made more readable and otherwise LGTM. PR merged. |
| [PR \#54](https://github.com/m1lun/m1skeletonProject/pull/54#pullrequestreview-5593226561) | m1lun submitted an APPROVED review, stating that the tests are standalone, readable and clean up data. PR merged. |

		  
		**Additional Internal Findings and Fixes**  
Internal testing also identified issues addressed through subsequent pull requests. [PR \#43](https://github.com/m1lun/m1skeletonProject/pull/43) documents a fix preventing negative values in built-in numeric and dimension fields, following a failure identified during Feature 1 end-to-end testing. [PR \#56](https://github.com/m1lun/m1skeletonProject/pull/56) improved the reliability of oversized-photo end-to-end tests by updating photo selection and test-file cleanup.

These changes were recorded as part of internal development and testing, independently of the formal peer-group review.
