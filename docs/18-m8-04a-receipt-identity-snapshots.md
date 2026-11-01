# Fledge Billing — M8-04A Receipt-Time Identity Snapshots

**Status:** Merged in PR #29  
**Migration:** 12 — `receipt-identity-snapshot`  
**Depends on:** [M8-04 receipt-generation contract](./17-m8-04-payment-receipt-generation.md)

## Scope

M8-04A captures the business and customer identity that existed when an ordinary customer payment receipt was first recorded. It does not generate or classify statutory GST receipt vouchers.

## Persistence

Migration 12 adds nullable `identity_snapshot_json` to `customer_receipt`. New receipt writes capture and store a structured snapshot inside the same SQLite write transaction as the receipt. The payload contains:

- Business legal/display name, address, State/UT ID and name, PIN, GST registration status/GSTIN, business type, phone and email.
- Customer name, phone/email, GSTIN, registration type, billing/shipping address, State/UT ID and name, and PIN.

The JSON payload is treated as immutable receipt evidence. It is returned with the receipt record and is not reconstructed from current master data.

## Legacy receipts

Existing receipts retain a NULL snapshot after migration. The migration does not backfill from current business/customer masters because those records may have changed since the original payment. Consumers must treat NULL as unavailable historical identity and must not silently substitute current profile values in a formal receipt.

## Idempotency

An idempotent retry returns the originally persisted receipt and its original identity snapshot. It does not recapture changed master data. Reusing a key for different receipt details remains rejected.

## Validation coverage

The persistence tests cover:
- Upgrade from schema version 8 through migrations 9–12.
- Snapshot capture on a newly recorded receipt.
- Snapshot stability after business/customer master edits and an idempotent retry.
- Preservation of pre-existing receipts with NULL snapshots after migration 12.

Automated tests have not been executed in the authoring environment. CI results, if available on the PR, are the validation source before merge.

## Boundaries

This slice does not implement receipt numbering, receipt PDF/print rendering, statutory receipt vouchers, GST advance tax automation, refund vouchers, payment gateway integrations, or cloud sync. Those remain separately scoped and gated by the decisions in docs/13 and docs/17.
