# Manage Moment: three-tab flow

Manage Moment now opens Contacts, followed by Message and Schedule. The standalone Details tab is removed. Schedule reuses the existing MomentCard, MomentIconTile, timezone selector, annual/catalog recurrence controls, preparation reminder values, recipient delivery controls, notification toggle and gradient CTA.

The Moment card displays stored name/type/date and opens a temporary Edit Moment form. Cancel discards only that form's draft. Save uses ManageFestivalModel and the existing festivalSave transaction. Existing schedules still require explicit cancellation before changing occasion fields. Catalogue-controlled dates remain protected; annual moments still require review and scheduling for each wish.

Schedule has one timezone selector and separate preparation and send-time reminders. Changing timezone preserves the calendar occasion date. The Moment date uses occurrenceDate (not the computed next annual occurrence); send time still initializes from the upcoming occurrence or saved delivery plan. Email connection is only offered for selected email recipients whose account is not connected.

No database schema or migration changes. festivalSave accepts an optional type; older clients omitting it retain the saved type. Type changes preserve IDs, source keys, recipient associations, settings and message/card data. Recipient keys continue to decode from the original source-key prefix even when the occasion type changes. Deploy the updated backend before shipping the updated iOS client so type edits are supported.

Implementation files: ManageFestivalView.swift (layout/edit sheet), ManageFestivalModel.swift (navigation, existing state and persistence), MomentRecipients.swift (compatible request and stable recipient key), MomentEditor.swift (updated flow comment), festival.ts (transactional type edit), and ImportantMomentsPreview.swift (saved fixture fields). Tests are in MomentUITests.swift, MomentRecipientsTests.swift and festival.integration.test.ts.

Validation: the iOS simulator build succeeds, all 259 Swift core tests pass, all 99 backend Moments tests pass, and TypeScript type checking passes. Targeted simulator tests cover the default/three-tab navigation, saved name/type/date/repeat edits, Cancel, keyboard dismissal, preserving edits through settings, preparation/send reminder persistence, and the existing full schedule/cancel-and-reschedule flow. The simulator is the 375-point-wide small iPhone fixture. Physical-device notification delivery and live email delivery were not exercised; their delivery services are unchanged.

The disconnected-email UI check also passes: Messages hides the connection link, then selecting Email reveals it. In total, 10 targeted UI scenarios passed across the final runs. Initial failures from obsolete notice assertions, duplicate switch selectors, native picker dismissal and the saved record's review-filter selection were corrected and rerun successfully.
