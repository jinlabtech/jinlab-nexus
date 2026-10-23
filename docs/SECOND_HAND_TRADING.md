# Second-Hand Goods Trading

This incremental module lives at `/second-hand`. It preserves the existing Nexus desktop shell. It supports recordkeeping; it does not certify SAPS compliance or replace registration, inspection, legal review, physical storage or staff procedures.

## Trading workspace

The overview shows a real branch setup checklist and six working areas: **Sellers & buyers**, **Acquisitions**, **Register & holds**, **Refurbish & resell**, **Trade-ins** and **Owner controls**. Each area has its own directory, device list, queues or controls. Empty states explain the next required action; no sample trading records are inserted into production. Counts and cost/margin figures cover the loaded branch records, with the full register export available for older history.

Sellers and buyers are searchable by name or masked identity ending. The register shows active holds, owner review, release decisions, quarantine and recent audit events. The workbench links to Nexus Repairs, Inventory and POS and reports recorded refurbishment costs and resale margins. Staff choices use existing confirmed company accounts; granting access remains an explicit owner action for the selected branch.

## First use

1. A database administrator enrols the independently verified company owner in `nexus_sh.access` for the correct branch. General Nexus role changes cannot grant access to this module.
2. The owner opens **Second-Hand Goods → Branch setup**, enters the actual dealer-registration and operating/legal-review references, confirms the premises and goods scope, and sets the holding policy. No certificate or review is assumed or invented.
3. The owner explicitly grants branch access to existing staff: clerk (intake, concerns and costs) or auditor (read and sensitive export). Owner enrolment is administrator-only.
4. Staff sight the seller's original identity document, verify adulthood, and retain a legible copy in a secured physical file. Enter the real file locator, identity details and ownership evidence. The working list masks the identity number. This release does not upload identity documents or item photographs.
5. Record the actual acquisition time, serial/IMEI, condition, purchase price, valuation, screening source/evidence, acquisition/payment reference and staff attestation. **New trade-in** presets the exchange workflow. Optionally choose an existing active company customer and an eligible replacement product in this branch: the server saves an immutable price/allowance snapshot and calculates the estimated balance or excess allowance. This does not reserve stock, grant store credit, collect payment or post accounting/POS entries. Seller verification remains separate and mandatory.
6. Quarantined items cannot be approved, refurbished, released or sold. Report suspect goods immediately to local SAPS and preserve evidence; record the SAPS acknowledgement. There is deliberately no quarantine override in this release.
7. Owner approval does not end the holding period. The default is eight elapsed days from the later of actual acquisition and recording. A legally reviewed policy may set 7–365 days for future acquisitions; existing holds cannot be shortened. Keep held items physically separate. The server blocks premature delivery/refurbishment and matching-device repair changes.
8. After the hold and owner approval, staff can use **Link repair** to choose a matching existing Nexus job without inventing a cost. The server verifies company, branch and IMEI/serial; later costs cannot replace an existing explicit job link. Record actual refurbishment costs separately. Do not create a customer repair job under the former seller merely to represent internal refurbishment: the normal repair workflow can invoice that customer. After release, the owner can create an inactive inventory reference with zero saleable stock.
9. Verify the buyer and retain their identity copy before recording disposal. Enter the actual external invoice and payment references, sale price and staff attestation. This records the sale register; it does not issue an invoice, collect payment or post accounting entries. Ordinary POS, stock-transfer and invoice paths are blocked for the linked device until a future atomic buyer/invoice integration is implemented.

## Access and records

Private tables in `nexus_sh` have RLS enabled and no direct browser/anonymous grants. Narrow authenticated RPCs validate a live account and a dedicated branch grant on every operation. IDs are absent from ordinary audit payloads and masked in workspace lists. Full statutory exports contain sensitive information, are limited to owner/auditor, and create an audit event. Store exports securely. Stock CSVs exclude seller/buyer identity information and escape spreadsheet formula prefixes.

Parties, acquisition evidence, costs and audit entries are append-only. No purge endpoint is provided. Retain the register and supporting identity copies for at least five years, with a reviewed backup, inspection and correction process. Current lists are bounded; use the full register export for historical inspection. A typed authenticated staff attestation is recorded, but signature adequacy and the electronic inspection/export format still require legal/DSO review.

## Release and recovery

Migration: `supabase/migrations/20261022140243_secondhand_trading_secure_mvp.sql`. It adds private tables, functions and guards; it does not rewrite or delete existing business records. The guard triggers only affect devices controlled by this module. Do not apply all historical repository migrations to production: existing deployment history includes independent releases.

Workflow expansion migration: `supabase/migrations/20261023042858_secondhand_workflow_integrations.sql`. It adds `nexus_sh.trade_in`, protected by RLS, no direct client grants and an append-only trigger. Narrow integration lookup/action wrappers enforce dedicated branch access, expose only the required customer/product/job/staff labels and preserve the original holding, quarantine and POS safeguards. Legacy trade-in references remain readable without a linked exchange estimate.

The pre-change schema metadata snapshot includes table definitions, constraints, grants, policies, functions, triggers, indexes and permission records. It is an inspection/recovery reference, not a complete restorable database/data backup. Confirm managed backups before routine trading.

Roll back the application by promoting the preceding known-good Vercel deployment. Preserve the private register and protective database guards; do not drop records to roll back a UI release. If the feature must be suspended, revoke dedicated branch grants through an audited administrator process and preserve required evidence.

## Legal references and remaining scope

- [Second-Hand Goods Act 6 of 2009, especially sections 21–23 and 26](https://www.gov.za/sites/default/files/gcis_document/201409/32087392.pdf)
- [2012 Dealers and Recyclers Regulations](https://www.gov.za/sites/default/files/gcis_document/201409/35220gon285.pdf)
- [SAPS routine inspection checklist](https://www.saps.gov.za/services/flash/shg/checklist_routine_inspections2020.pdf)

The bounded review did not establish that later draft amendments are in force. Exact counting rules, accepted identity/signature methods, certificate conditions, registration validity, secure-copy arrangements and inspection requirements require confirmation. Automatic POS/trade-in financial posting, online identity verification, police blacklist integration, document uploads, returns/reacquisitions, quarantine resolution and formal correction workflows remain outside this release. Trade-in estimates are recordkeeping snapshots, not payment tenders or enforceable customer balances.

The existing `company`, `branch` and `user_profile` tables were found without RLS, with anonymous/authenticated grants. This predates the module and requires a separate regression-tested security remediation. The module intentionally does not trust their mutable roles for access. Do not mistake protection of the new private register for an application-wide security certification.
