# Auth Specification

## Purpose
Authentication and session management for the dashboard.

### Requirement: User Authentication
The system SHALL issue a JWT token upon successful login.

#### Scenario: Valid credentials
- GIVEN a user with valid credentials
- WHEN the user submits the login form
- THEN a JWT token is returned and a session is created

#### Scenario: Invalid credentials
- GIVEN a user with an incorrect password
- WHEN the user submits the login form
- THEN the system SHALL reject the request with a 401 error

### Requirement: Session Expiry
The system SHALL expire idle sessions after 24 hours.

#### Scenario: Idle timeout
- GIVEN an authenticated session with no activity for 24 hours
- WHEN the user makes a request
- THEN the system SHALL require re-authentication
