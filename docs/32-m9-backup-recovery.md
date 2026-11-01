# M9 — Local backup and recovery

Fledge stores business records in this browser's IndexedDB. Browser storage can
be cleared, evicted, or lost with the device. Keep an encrypted backup outside
the browser and make a fresh backup after important changes.

## Export a backup

1. Open **Backup & recovery** in the workspace.
2. Enter and confirm a passphrase of at least 12 characters.
3. Download the `.fledge-backup.json` file.
4. Store the file somewhere separate from this device and keep the passphrase
   separately in a secure place.

The export encrypts all ten business-owned IndexedDB stores with AES-GCM-256.
The key is derived from the passphrase using PBKDF2-SHA-256 and a fresh random
salt; each export also uses a fresh random IV. The file contains sensitive
business, customer, invoice, and payment data. Do not share it as an ordinary
document.

Fledge does not store or recover the passphrase. If it is lost, the backup
cannot be restored. Encryption protects the exported file, but does not encrypt
the browser's live IndexedDB records.

## Restore a backup

1. Open **Backup & recovery** in the destination workspace.
2. Select the `.fledge-backup.json` file and enter its passphrase.
3. Confirm replacement after reviewing the warning. Restore replaces every
   current local business record in this browser; export the current workspace
   first if it may be needed.
4. Wait for the success message before closing the page.

Fledge authenticates and decrypts the file, checks its format, schema version,
store list, record identifiers, business ownership, and unique indexed values,
then replaces records in one IndexedDB read/write transaction. Invalid files,
incorrect passphrases, and failed transactions leave the current records
unchanged.

## Compatibility and scope

Backup format version 1 supports IndexedDB schema version 5 only. A backup
from an older or newer schema is rejected without modifying the workspace;
restore is not a schema migration mechanism. Create a fresh export after
upgrading Fledge. Version compatibility is expanded only with explicit
conversion logic and tests.

Backups are local files only. They are not synchronized or uploaded to Fledge.
Restoring requires a compatible Fledge version and the original passphrase.
Cloud backup, account-based recovery, and automatic backup scheduling are not
implemented.

## Verification

Automated browser tests create a valid business with a finalized GST invoice,
receipt, and partial allocation; export it; restore it into a clean IndexedDB
profile; compare record counts and records in all ten stores; and verify the
restored invoice outstanding amount and customer advance. Tests also cover
current schema compatibility, rejection of older/newer schemas, corrupted
files, wrong passphrases, malformed records, and transaction rollback.
