import type { TaskActionChannel } from './todayActionQueue';

/**
 * `ActionNeededState` and `TaskActionRecipient` (ios/Sources/NexdoCore/ActionNeededState.swift):
 * "A card only offers communication after a recipient and address are available."
 */

export type ActionNeededState =
  | { kind: 'loading' }
  | { kind: 'retry' }
  | { kind: 'findBusiness' }
  | { kind: 'chooseBusiness' }
  | { kind: 'chooseContact' }
  | { kind: 'ready'; channels: TaskActionChannel[] };

/** `channels(hasPhone:hasEmail:)`: a phone gives Call and Message, an email gives Email. */
export function actionChannels(hasPhone: boolean, hasEmail: boolean): TaskActionChannel[] {
  return [...(hasPhone ? (['call', 'message'] as const) : []), ...(hasEmail ? (['email'] as const) : [])];
}

/**
 * `resolve(...)`: ready once a recipient has a usable address; otherwise loading or retry until the
 * lookup has answered, then the business search or shortlist, else choose a contact. A chosen business
 * with no usable details stays recoverable through the shortlist.
 */
export function resolveActionNeeded({
  loaded,
  failed,
  business,
  hasResults,
  hasRecipient,
  hasPhone,
  hasEmail,
}: {
  loaded: boolean;
  failed: boolean;
  business: boolean;
  hasResults: boolean;
  hasRecipient: boolean;
  hasPhone: boolean;
  hasEmail: boolean;
}): ActionNeededState {
  if (hasRecipient) {
    const channels = actionChannels(hasPhone, hasEmail);
    if (channels.length > 0) return { kind: 'ready', channels };
  }
  if (!loaded) return failed ? { kind: 'retry' } : { kind: 'loading' };
  if (business) return hasResults ? { kind: 'chooseBusiness' } : { kind: 'findBusiness' };
  return { kind: 'chooseContact' };
}

/**
 * `TaskActionRecipient`: contact details the user typed. Google business details are not stored here;
 * they are fetched fresh by id (`businessCandidateID` on the stored action).
 */
export type TaskActionRecipient = { name: string; phone: string; email: string };

const PHONE_CHARACTERS = new Set('+0123456789 ()-.');

/**
 * `TaskActionRecipient.isValid(name:phone:email:)`: a name and at least one of phone or email. A phone
 * has at least three digits and only `+0123456789 ()-.`; an email is `something@something.something`
 * with no spaces.
 */
export function isValidRecipient({ name, phone, email }: TaskActionRecipient): boolean {
  const trimmedName = name.trim();
  const trimmedPhone = phone.trim();
  const trimmedEmail = email.trim();
  const phoneValid =
    trimmedPhone === '' ||
    (Array.from(trimmedPhone).filter((char) => /\p{N}/u.test(char)).length >= 3 && Array.from(trimmedPhone).every((char) => PHONE_CHARACTERS.has(char)));
  const emailValid = trimmedEmail === '' || /^[^\s@]+@[^\s@]+\.[^\s@]+$/u.test(trimmedEmail);
  return trimmedName !== '' && (trimmedPhone !== '' || trimmedEmail !== '') && phoneValid && emailValid;
}
