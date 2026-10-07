# Fledge Billing — Architecture

**Phase:** 3 of 8  
**Status:** Architecture baseline  
**Version:** 1.0

## 1. Architecture Goals
- Offline-first operation
- Strong domain separation
- Testable billing/GST calculations
- Versioned rules
- Template independence
- Safe database migrations
- Future cloud synchronization
- Platform-independent application logic

## 2. Layered Architecture
UI / Presentation
↓
Application / Use Cases
↓
Domain
  - Billing Engine
  - GST Engine
  - Numbering Engine
  - Template Engine
↓
Repository Interfaces
↓
Local Database

Future:
Application
  - Local Repository → SQLite
  - Sync Repository → API → PostgreSQL

## 3. Domain Modules
Business, Customer, Product/Service, Document, Invoice, Payment, GST, State/UT master, Number series, Templates, Settings, Updates, Audit/history.

## 4. Key Rule
UI code must never contain GST calculation rules. It calls application use cases, which call domain services.

## 5. Billing Engine
Responsible for line calculations, discounts, taxable values, charges, totals, payment state and document lifecycle.

## 6. GST Engine
Inputs include supplier context, recipient context, place of supply, document type, item classification, tax category, configured rate and pricing mode.

Outputs include taxable value, applicable tax components, tax amounts, total tax, total invoice value, rule version and calculation metadata.

## 7. Rule Versioning
GST rules must have rule ID, version, effective-from date, optional effective-to date, source/reference, active status, jurisdiction and calculation parameters.

## 8. Repository Pattern
Domain/application code depends on repository interfaces. SQLite is an implementation detail. This allows future cloud storage without redesigning the domain.

## 9. Database Migrations
Every schema change has a migration version. Startup checks installed schema version and runs only compatible migrations. A failed migration must not leave the database partially upgraded.

## 10. Updates
UpdateService exposes current version, latest version, minimum supported version, release notes, platform/architecture, download URL, checksum/signature metadata, GST rules version and migration requirements.

## 11. Security
Sensitive local data should use appropriate OS/database protection. Secrets must not be committed to Git. Network traffic for future server services must use HTTPS.

## 12. Testing Architecture
- Domain unit tests
- GST calculation tests
- Invoice lifecycle tests
- Database repository tests
- Migration tests
- Template rendering tests
- Update compatibility tests
- End-to-end critical workflows

## 13. Architectural Non-Goals
Do not couple core billing logic to one UI framework, one PDF renderer, one operating system, one Indian state, or one future cloud provider.
