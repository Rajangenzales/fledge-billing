# Fledge Billing — Update & Distribution Architecture

**Phase:** 7 of 8  
**Status:** Distribution baseline  
**Version:** 1.0

## 1. Distribution Model
Fledge Billing will be deployed from a controlled server and users will receive an installation/download link appropriate to their platform.

## 2. Update Service
The application communicates with a versioned update metadata endpoint.

Example response fields:
version, minimum_supported_version, release_date, release_notes, platforms, gst_rules_version, database_schema_version, mandatory.

## 3. Update States
- Up to date
- Optional update available
- Mandatory update required

Mandatory updates must be rare and must not unnecessarily lock users out of local billing data.

## 4. User Experience
Settings → Application:
- Version
- GST Rules Version
- Database Schema Version
- Check for Updates

When available:
- version
- release notes
- compatibility information
- Update Now
- Later

## 5. Safe Update Sequence
1. Check metadata.
2. Validate platform and compatibility.
3. Inform user.
4. Create a recovery point where supported.
5. Download release.
6. Verify checksum/signature.
7. Install/update.
8. Run database migrations.
9. Validate schema.
10. Start application.
11. Record successful migration/update.

## 6. Database Safety
Application and database versions are separate. A new application must know which schema versions it can open and which migrations it can perform.

## 7. GST Rule Updates
A release may contain new GST rules/data. Historical documents retain the rule version used when finalized.

## 8. Platform Notes
Desktop/mobile distribution mechanisms differ by operating system. The update service must abstract platform-specific installation behaviour rather than assuming one universal installer.

## 9. Release Manifest
A release should include semantic application version, release date, minimum supported version, supported platforms, architecture, download URL, checksum, signature metadata where supported, database migration requirement, GST rules version and release notes.

## 10. Security
Use HTTPS. Do not execute an unverified downloaded binary. Secrets/signing keys must remain outside the repository.

## 11. Rollback
Where technically possible, preserve the previous application version and database recovery path. Database migrations must make recovery explicit rather than relying on blind downgrade.

## 12. Future
Possible later features: staged releases, update channels, admin-controlled deployment, telemetry with explicit privacy controls.
