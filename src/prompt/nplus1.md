I want to set up an automated test to detect N+1 query problems in my Spring Boot + Data JPA project using the 'spring-hibernate-query-utils' library. Please perform the following tasks:

### [Requirements]

1. Add Dependency:
    - Add the following dependency to my `build.gradle` or `build.gradle.kts` (Gradle) file:
        - Group ID: `com.yannbriancon`
        - Artifact ID: `spring-hibernate-query-utils`
        - Version: (Please use the latest stable version)

2. Write an N+1 Verification Test:
    - Create an integration test class using `@SpringBootTest`.
    - Identify an existing One-to-Many relationship (e.g., Parent and Child entities) in the current codebase to use for the test.
    - Use the `@AssertSelectCount(1)` annotation on the test method to ensure only one SELECT query is executed.
    - Crucial Steps in the Test:
        - Use `EntityManager` to `flush()` and `clear()` the persistence context after saving test data to ensure the 1st-level cache is empty.
        - Implement logic that retrieves the parent entities and then triggers Lazy Loading by accessing the child collection (e.g., `parent.getChildren().size()`).

3. Provide a Solution Guide:
    - If the test fails (confirming an N+1 issue), add a commented-out example in the test file showing how to fix it using a `Fetch Join` in the Repository layer.

4. Verify Configuration:
    - Check if any additional Bean configuration is required for `@AssertSelectCount` to work and apply it if necessary.

Writing tests should be written via agent team or subagent to ensure parallel coding and time efficiency. Please proceed with the implementation of the above tasks. Don't use subagent for command running; it might cause concurrency issues.
