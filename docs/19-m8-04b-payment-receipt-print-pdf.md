# Fledge Billing — M8-04B Ordinary Payment Receipt Print and PDF

**Status:** Implementation proposed in PR; not yet merged  
**Depends on:** M8-04 contract (docs/17) and receipt-time identity snapshots (docs/18)

## Scope

M8-04B renders an ordinary commercial payment acknowledgement from a persisted `customer_receipt` event and its immutable receipt-time identity snapshot. It provides printable text and a local A4 PDF export. Rendering is read-only.

It is not an invoice, tax invoice, statutory GST receipt voucher, refund voucher, credit note or debit note. No GST tax is calculated or displayed.

## Render content

- Business display name (falling back to legal name), address, contact details and GSTIN only when the receipt-time snapshot says the business is GST-registered.
- Customer name, billing address, contact details and GSTIN when present in the snapshot.
- Payment date exactly as stored, exact INR amount, payment method, external transaction reference and notes when supplied.
- Stable internal receipt ID labelled **Receipt reference (internal)**. This is not a human-facing serial number and is not represented as statutory numbering.
- Clear statement that the document acknowledges payment and is not a tax invoice or statutory GST receipt voucher.

The current logo is intentionally omitted because a historical logo snapshot policy has not been approved. Allocation and refund/reversal history are also omitted; the receipt acknowledges only the original receipt event and does not imply invoice settlement.

## Legacy receipt handling

A receipt without a receipt-time identity snapshot is blocked from formal print/PDF generation with a clear error. The renderer never substitutes current business/customer master data.

## PDF and local export

- A4 PDF generated from the same printable receipt content.
- Standard embedded PDF fonts; unsupported glyphs return a clear rendering error rather than silently corrupting text.
- Filename uses a sanitized internal receipt ID and the saved payment date.
- Local export follows the existing safe partial-file then rename pattern.
- No network transfer, email/WhatsApp, cloud sync or payment gateway.

## Validation coverage added

- Receipt text includes saved payment date, exact INR display, internal reference, method and external transaction reference.
- Legacy receipt without snapshot is blocked.
- PDF output is loadable and has expected document metadata.
- Existing migration and snapshot tests remain in the suite.

Automated tests have not been executed in the authoring environment. Review CI before merge.

## Remaining decisions and exclusions

- Human-facing receipt serial numbering remains unapproved and is not implemented.
- Logo history, allocation presentation and adjustment statement design remain out of scope.
- Statutory receipt voucher classification, Rule 50 content and GST advance tax treatment require qualified GST-practitioner review.
- No user interface wiring or end-to-end customer-facing workflow is included in this application-layer slice.
