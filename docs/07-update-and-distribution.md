# Fledge Billing — Update & Distribution Architecture

**Phase:** 7 of 8  
**Status:** Distribution baseline  
**Version:** 1.0

## 1. Distribution Model
Fledge Billing will be deployed from a controlled server and users will receive an installation/download link appropriate to their platform.

## 2. Update Service
The application communicates with a same-origin release manifest. Production
hosting of this endpoint is deferred until product completion; development
uses the local release descriptor and remains at version `0.0.0-dev`.

The release manifest records semantic version, minimum supported version,
release date and notes, supported OS/browser pairs and minimum browser majors,
web architecture/reference URL, service-worker and built-asset SHA-256 hashes,
database schema/migration compatibility, GST rules version and mandatory
status.

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
4. Preserve the active worker and prior complete shell cache.
5. Download release.
6. Verify the service-worker and app-artifact hashes against trusted release
   metadata.
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
A release should include semantic application version, release date, minimum
supported version, supported platforms/browser versions, architecture,
download/reference URL, checksums, signature metadata where supported,
database migration compatibility, GST rules version and release notes. The
current PWA release manifest is unsigned; same-origin HTTPS checksums do not
protect against a compromised hosting origin.

## 10. Security
Use HTTPS. Do not execute an unverified downloaded binary. Secrets/signing keys must remain outside the repository.

## 11. Rollback
Where technically possible, preserve the previous application version and
database recovery path. The current service worker retains the previous
complete app-shell cache but does not automatically roll back activated app
code or database migrations. Database migrations must make recovery explicit
rather than relying on blind downgrade. See the [M10 release contract](./33-m10-pwa-lifecycle.md)
for current implementation details and release gates.

## 12. Future
Possible later features: staged releases, update channels, admin-controlled deployment, telemetry with explicit privacy controls.
