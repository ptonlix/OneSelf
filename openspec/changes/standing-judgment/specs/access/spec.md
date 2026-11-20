# Spec Delta

## ADDED Requirements

### Requirement: Approval screens pre-check self read
When `self` is listed, the device and API key approval screens MUST initially check its read box and MUST leave its write and visibility boxes unchecked. The owner MUST be able to uncheck read before confirm. Confirm MUST store only the boxes still checked. A restricted grant that omits `self` MUST NOT gain it on the server. An existing restricted grant MUST NOT gain `self` because this default appeared. Unrestricted approval MUST keep ignoring the source list.

#### Scenario: Restricted approval starts with self read
- **WHEN** the owner opens a device or API key approval screen that lists `self` and has not edited the boxes
- **THEN** `self` read is checked and its write and visibility boxes are not

#### Scenario: Unchecking self is stored
- **WHEN** the owner unchecks `self` read and confirms a restricted grant
- **THEN** the stored grant does not include `self` and `whoami` does not list it

#### Scenario: Older restricted grant is unchanged
- **WHEN** a restricted grant approved before this default is used after upgrade
- **THEN** it still includes only its stored sources
