# Fledge Billing — Technology Stack (M0)

**Status:** Adopted for foundation milestone  
**Version:** 0.15

## Decision

M0 uses a **TypeScript pnpm monorepo** with strict layer boundaries:

| Package | Role |
| --- | --- |
| `@fledge/domain` | Pure domain types and engines. Money is exact. The billing engine calculates commercial totals. GST component splits come later. |
| `@fledge/application` | Configuration, logging, errors, future use cases. No SQLite dependency. |
| `@fledge/persistence` | Local SQLite connection, schema migrations, and later repository implementations. |
| `@fledge/app` | Application shell entry (CLI and local HTTP health endpoint). Opens the database on serve. |

## Rationale

- **Architecture alignment:** Domain and application code stay independent of UI and SQLite (see `docs/03-architecture.md`).
- **Testability:** Vitest runs domain and application unit tests without a UI or database.
- **Local-first:** The shell runs fully offline; no network is required for install, test, build, or default startup.
- **Future platforms:** TypeScript domain modules can be reused by a future desktop or mobile shell (Tauri, Electron, React Native, etc.) without rewriting billing logic.

## Money (M0-A)

Financial amounts live in `@fledge/domain` as exact rationals: a `bigint` numerator and denominator in rupees, reduced on every operation. The domain package does not take a decimal library, and money is never constructed from a JavaScript `number`.

`INR_MINOR_SCALE` is 2, so persisted and displayed currency amounts are paise. `Money.parse` and `Ratio.parse` accept decimal strings. `Money.fromMinor` accepts minor units at a declared scale.

`roundHalfUp(amount, decimalPlaces)` is the only rounding operation. It rounds half away from zero. `add`, `subtract`, and `times` leave the exact value unchanged, including non-terminating results such as an inclusive-price split. The GST engine will call `roundHalfUp` at the calculation stage defined for that rule, usually `INR_MINOR_SCALE`. Formatting a non-terminating amount throws until it has been rounded.

Input strings allow at most 15 digits before the decimal point and 8 after it. That bound applies to typed input, not to exact intermediate rationals produced by multiplication.

## Local database (M0-B)

SQLite is the local database. The driver is Node.js 22 `node:sqlite` (`DatabaseSync`), used only inside `@fledge/persistence`. Node 22 still marks that module experimental. Keeping it behind this package means a later driver change does not touch domain or application code. No native addon is required.

`FLEDGE_DATABASE` defaults to `data/fledge.sqlite`. `:memory:` is reserved for tests.

Schema changes go through `migrate`. Versions are contiguous integers starting at 1. The `schema_migration` table stores version, name, and applied time. Startup applies only migrations newer than the installed version, and only when each installed row matches this build's version and name. A database newer than the application is refused. Each migration runs in one transaction with its version row, so a failure rolls that migration back and leaves earlier versions applied.

`pnpm start` opens the database, migrates, then serves `/health` with `schemaVersion`. The one-shot CLI status command does not create a database file.

## State and UT master (M1-A)

Migration `state-ut-master` creates `state_ut` and seeds it from `STATE_UTS` in `@fledge/domain`. Ids are stable `IN-` plus the ISO 3166-2 subdivision code, for example `IN-KL`. `gst_state_code` is the two-digit GST code stored as text.

The seed has 28 active states and 8 active Union Territories. GST code 25, former Daman and Diu, is inactive. GST code 26 is Dadra and Nagar Haveli and Daman and Diu. Codes 97 and 99 are not seeded. `listStateUts` reads the table back in GST-code order.

## Business profile (M1-B)

Migration `business-profile` creates `business` and `business_setting`. `saveBusinessProfile` stores one local business. Legal name, address, and an active State or Union Territory are required. GST registration status and GSTIN stay separate: a registered business needs a GSTIN, and an unregistered business has none.

The GSTIN is 15 characters. The first two digits must match the selected State or Union Territory, position 14 is `Z`, and position 15 is the GSTN modulus-36 check digit. `27AAACR5055K1Z7` is the worked example.

`payment_details` and `invoice_preferences` are the business settings saved with the profile. District stays out of this migration until a district master exists, so the address is not a free-text state or district name. `state_id` references `state_ut`.

## Customers (M2)

Migration `customer` creates `customer`, linked to the local business and to `state_ut`. A customer can be saved only after the business profile exists. Name, billing address, and an active State or Union Territory are required. Shipping address, phone, email, PIN, and notes are optional.

`registration_type` is `registered` or `unregistered`, separate from the GSTIN. A registered customer needs a GSTIN whose state code matches the customer State or Union Territory. The check digit is the same modulus-36 rule as the business profile. Deactivating a customer sets `active` to false and keeps the row. `listCustomers` returns active customers unless inactive rows are requested.

## Products and services (M3)

Migration `product-service` creates `tax_category`, `saved_gst_rate`, and `product_service`. Tax categories are the closed set taxable, exempt, nil-rated, and non-GST. A saved GST rate is a name and an exact percentage for one business. It is user configuration. It is not the versioned `tax_rate` or GST rule table, which arrive with the GST engine.

A taxable item must point at a saved rate and may be tax-inclusive. Exempt, nil-rated, and non-GST items have no saved rate and are not tax-inclusive. Prices and discounts are exact rupee amounts in paise. HSN/SAC, when present, is 4, 6, or 8 digits. This milestone does not calculate tax and does not ship an HSN master. Deactivating a product or a saved rate keeps the row.

## Billing engine (M4)

Migration `billing-document` creates `document`, `document_item`, `document_charge`, and `number_series`. It does not create `document_tax`. `gst_rule_version_id` and `template_id` stay empty until the GST engine and templates exist.

A document is a tax invoice, non-GST invoice, bill of supply, quotation, or receipt. A tax invoice is GST-enabled. A non-GST invoice, bill of supply, or receipt is not. A quotation may be either. Drafts are editable and have no document number. Finalizing a draft assigns the next number and leaves the saved amounts unchanged. Cancelling a draft or a finalized document keeps an issued number and does not rewind the series. Status values `partial` and `paid` are reserved for payments and are not written here.

Totals are calculated from stored source values. Each line discount and each line net are rounded half up to paise on their own. The subtotal is the sum of those rounded line nets and rounded discounts. The grand total is the sum of the rounded line nets plus charges, so it can differ from the subtotal minus the discount by a paise. `line_amount` and `discount_amount` are stored because `taxable_value` is not the payable amount when a price includes tax.

When GST is off, the taxable total is zero and a line cannot carry a GST rate or a tax-inclusive price. When GST is on, every line stores a percentage snapshot, including zero. An inclusive taxable value is the exact net multiplied by 100 and divided by 100 plus that rate, then rounded half up to paise. `Money.dividedBy` performs that division. M4 left the tax total at `0` and treated an exclusive grand total as the pre-tax amount. M5 adds component tax for drafts and newly issued documents.

Number series are separate for each business, document type, and Indian financial year (April through March, labeled `2026-27`). The default prefixes are INV, NG, BOS, QT, and RCT. A number looks like `INV/2026-27/0001`. Padding is 3 to 6 digits and defaults to 4. A sequence longer than the padding is not truncated. The next number can be set before anything is issued. After a number is issued, it can only move forward. Allocation runs inside the same write transaction as finalizing, and a draft does not consume a number. M5 recalculates tax from the stored source values in that same transaction.

## GST engine (M5)

Migration `gst-engine` is version 6. It adds `gst_rule_version`, `gst_rule_utgst_territory` and `document_tax`, and snapshots the supplier and recipient on `document`. Finalized rows that already existed keep their stored totals. The migration does not calculate tax for them.

The seeded rule `gst-structure-2017-07-01` is effective from 1 July 2017. It records how a configured percentage is split. It is not an HSN rate list. The percentage on a line is the configured rate. A difference from the product's saved rate is reported and is not overwritten.

Component choice uses the supplier's GST state code and the explicit place of supply. IGST Act sections 7 and 8 treat the same State or Union territory as intra-state and different locations as inter-state. The customer's State is stored separately. IGST Act sections 10 to 13, which would derive place of supply, are not applied.

Intra-state tax is half CGST and half SGST. UTGST replaces SGST only for the Union territories named in UTGST Act section 2(8): Chandigarh, Dadra and Nagar Haveli and Daman and Diu, Lakshadweep, Andaman and Nicobar Islands, and Ladakh. Delhi, Puducherry and Jammu and Kashmir take SGST. Inter-state tax is IGST at the full percentage.

Each component is rounded half-up to paise from the paise taxable value. CGST Act section 170 rounds tax payable to the government to the nearest rupee and is not applied on the invoice. An intra-state split can therefore differ by one paise from IGST on the same value. For a tax-inclusive price, any difference between the embedded tax and the sum of the rounded components is stored as `rounding_residual` and is not folded into a component. Exclusive tax is added to the grand total. Inclusive tax is already inside the line amount. Reverse charge is an explicit flag: the tax is calculated and kept out of the amount payable to the supplier. Named reverse-charge categories and compensation cess are rejected until a verified rule is seeded.

A tax invoice or bill of supply requires a GST-registered business. A tax invoice needs at least one taxable or nil-rated supply. Exempt and non-GST values stay out of the taxable total.

## Invoice templates (M6)

Migration `invoice-template` is version 7. It creates `invoice_template`, `template_section` and `template_field`. The seven built-in families are Standard, GST, Service, Retail, Quotation, Receipt and Bill of Supply. They are copied for the business the first time templates or a document are used. Each document type has one default. A new document stores that template id. Finalizing keeps it. Choosing a different default later does not change a finalized document or its totals.

A vendor can rename safe labels, such as Customer to Buyer, and show or hide optional fields and sections such as phone and payment. Statutory labels, including GSTIN, place of supply, HSN/SAC and the tax breakup, stay as written. Protected parts cannot be hidden. Labels cannot contain markup or copy a statutory heading. Saving an edit inserts the next template version and leaves the previous rows unchanged, so an issued document and an open draft keep the version they already store until the draft chooses another template.

Migration `custom-field` is version 8. A template version can add up to 20 custom fields of type short text, long text, number, date, phone, email, web address, or yes/no. A custom field has a stable key, a label, an optional helper, and a section. It cannot use a statutory heading such as GSTIN or sit in the tax summary. Values are stored as text on the document. They are not amounts and are not read by the billing or GST engines. A required value can be left blank on a draft and blocks finalization until it is entered. Finalizing copies the field label, type, and value onto the document. A later template version does not change that copy.

A template preview lays out the saved template, or an unsaved edit, around sample invoice data. The sample number is `Preview`. Amounts come from the GST engine for a fixed sample: a tax invoice and a quotation use ₹1000 at 18%, a non-GST invoice and a receipt use three notebooks at ₹10.10 with a 10% discount, and a bill of supply uses ₹40 exempt. The preview says it is not a saved invoice. It does not insert a document or take a document number. Restoring a template writes a new version from the built-in layout and leaves the previous version in place.

An issued document renders from the template version stored on it and from the amounts, tax rows, and custom-field labels saved with the document. A later template edit does not change that render. A document saved before templates existed has a null template id. It renders with the built-in layout for its document type, and the render does not write a template id or recalculate the stored total. Supplier and customer names still come from the current master records. Reordering and brand styling are not in this slice.

## PDF, print and share (M7)

PDF generation uses [pdf-lib](https://pdf-lib.js.org/) 1.17.1. It is pure JavaScript, so the shell can build a PDF offline without a native addon or a network call. The embedded face is the standard Helvetica that ships inside the library. A4 is the only page size. Text that Helvetica cannot draw is rejected before a file is written.

Print text, the PDF, and the saved file all start from the issued-document render. Amounts are copied from that render and shown as `INR 1,180.00`. The stored total string is left as `1180`. A long invoice continues on the next page instead of shrinking the type. Page numbers are drawn after the pages exist. A money line moves to the next page as a whole so the amount stays with its label.

Export writes `tax-invoice_INV-2026-27-0001_2026-10-31.pdf` in a chosen local folder. The file is written to a temporary name and renamed into place. The name uses the document type, number, and date. Share on this shell is that same local file. Nothing is emailed or uploaded. A logo is embedded only when the caller supplies PNG or JPEG bytes under 1 MB. A web address is never fetched. A failed export leaves the issued invoice unchanged.

## Tooling

- Node.js 22 LTS (via Cloud Agent default image or local install)
- pnpm workspaces with lockfile
- TypeScript project references
- Vitest for unit and smoke tests

## Configuration

Copy `.env.example` to `.env` for local overrides. Required settings have safe defaults; invalid values produce human-readable errors without printing secrets.

## Commands

```bash
pnpm install
pnpm test
pnpm build
pnpm start          # HTTP shell on FLEDGE_PORT (default 3847)
node packages/app/dist/cli.js   # one-shot shell status (no server)
```
