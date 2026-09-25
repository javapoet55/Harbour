/**
 * `TaskActionServiceError` (ios/App/TaskActionCoordinator.swift:5-19), copy for copy.
 *
 * Every string here is shown to a person, so each one is Swift's `errorDescription` verbatim.
 */
export const ACTION_ERRORS = {
  notificationsDenied:
    'Notifications are off. Enable notifications for Nexdo in Settings to receive action reminders.',
  contactsDenied: 'Allow Nexdo to access Contacts in Settings, then try again.',
  noContact: 'No matching contact is available. Check the name and which contacts you’ve shared with Nexdo.',
  noPhone: 'This contact has no phone number. Add a number in Contacts or choose another person.',
  noEmail: 'This contact has no email address. Add an address in Contacts or choose another person.',
  unavailable: 'This action isn’t available on this device. Check Messages or Mail setup and try again.',
  invalidPhone: 'This phone number can’t be used for a call. Update it in Contacts.',
} as const;

export type ActionErrorCode = keyof typeof ACTION_ERRORS;

export class TaskActionError extends Error {
  readonly code: ActionErrorCode;

  constructor(code: ActionErrorCode) {
    super(ACTION_ERRORS[code]);
    Object.setPrototypeOf(this, TaskActionError.prototype);
    this.name = 'TaskActionError';
    this.code = code;
  }
}

/** `notice` strings the coordinator sets outside the error enum. */
export const ACTION_NOTICES = {
  /** `activate(userID:)` (TaskActionCoordinator.swift:52). */
  unreadable: 'Saved action settings couldn’t be read. Open your tasks to rebuild reminders.',
  /** `persist()` (`:131`). */
  unsaved: 'Action settings couldn’t be saved on this device. Please try again.',
  /** `queueSchedule()` (`:152`), when more than 48 reminders are wanted. */
  limited: 'The next 48 action reminders are scheduled. Open Nexdo regularly to schedule later reminders.',
} as const;
