# Spec Delta

## ADDED Requirements

### Requirement: Owner can delete an OAuth grant record
The server MUST provide `POST /admin/oauth-grants/{id}/delete` for an owner session, with the same origin check as revoke. Deletion MUST be soft: the row stays, with `deleted_at` set. An active grant MUST be revoked first. After deletion, the list MUST NOT include that id. A missing or already deleted id MUST be `not_found`. An API key or OAuth token MUST get `forbidden`. The route MUST NOT be published in OpenAPI or MCP.

#### Scenario: Deleting an active grant removes it and stops its token
- **WHEN** the owner deletes an active device grant and the previous access token calls the server
- **THEN** the grant is absent from the list and the token is not accepted

#### Scenario: Deleting a revoked grant removes the history row
- **WHEN** the owner deletes a grant that is already revoked and lists again
- **THEN** that id is not in the list

#### Scenario: Missing grant is not found
- **WHEN** the owner deletes an id that is not stored
- **THEN** the response is `not_found`

### Requirement: Approved devices panel can delete a row
The overview and the device approval list MUST offer delete for every grant, including revoked ones. Delete MUST need a second confirming click, then call `POST /admin/oauth-grants/{id}/delete` and reload the list. A revoked row MUST still show that it was revoked until it is deleted.

#### Scenario: Revoked row can be deleted after confirmation
- **WHEN** the owner clicks delete once on a revoked grant
- **THEN** no request is sent until the owner clicks the confirming action
