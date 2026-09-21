import * as MailComposer from 'expo-mail-composer';
import * as SMS from 'expo-sms';
import { Linking } from 'react-native';

import { TaskActionError } from './errors';

/**
 * `TaskActionComposers.swift` — the composer half of the action screen, and the `tel:` call.
 *
 * Swift wraps `MFMessageComposeViewController` and `MFMailComposeViewController` in
 * `UIViewControllerRepresentable`s and presents them as sheets (`:22-41`, `:42-66`). Expo's
 * equivalents are `SMS.sendSMSAsync` and `MailComposer.composeAsync`, which open the SAME system
 * composers and resolve with the same three outcomes — so screen 32 has no view of its own here;
 * the system provides it.
 *
 * NOTHING IS EVER SENT AUTOMATICALLY. Both calls open an editable draft, exactly as Swift's
 * comment at `TaskActionView.swift:272` insists.
 */

/** `ActionComposeResult` (TaskActionComposers.swift:4). */
export type ActionComposeResult = 'submitted' | 'cancelled' | 'saved' | 'failed';

/** `ActionEmailDraft` (TaskActionComposers.swift:5-9). */
export type ActionEmailDraft = {
  recipient: string;
  subject: string;
  body: string;
};

/** `NativeTaskActionEmailService.draft(recipient:name:context:)` (TaskActionComposers.swift:17-21). */
export function emailDraft({ recipient, name, context }: { recipient: string; name: string; context?: string | null }): ActionEmailDraft {
  return {
    recipient,
    subject: context ? `Follow-up: ${context}` : 'Following up',
    body: `Hi ${name},\n\n${context ? `Just following up regarding ${context}.` : 'Just checking in.'}\n\nThanks.`,
  };
}

/** The message body built inline at `TaskActionView.swift:224`. */
export function messageBody({ name, context }: { name: string; context?: string | null }): string {
  return `Hi ${name}, ${context ? `following up regarding ${context}.` : 'just checking in.'}`;
}

/** `MFMessageComposeViewController.canSendText()` (TaskActionView.swift:270). */
export async function canSendMessage(): Promise<boolean> {
  return SMS.isAvailableAsync();
}

/** `MFMailComposeViewController.canSendMail()` (TaskActionComposers.swift:16). */
export async function canSendEmail(): Promise<boolean> {
  return MailComposer.isAvailableAsync();
}

/**
 * `ActionComposeResult` plus the outcome iOS never produces: Android's SMS intent resolves
 * `unknown` whether or not the person tapped Send. That is not an error, so callers that can
 * represent "opened, unconfirmed" must tell it apart from a genuine failure.
 */
export type MessageComposeOutcome = ActionComposeResult | 'unknown';

/**
 * Opens the message composer, keeping an unverifiable outcome as `unknown`.
 * `MFMessageComposeViewController` always reports a definite result, so on iOS this never returns
 * `unknown`; `expo-sms` returns it for every Android send.
 */
export async function composeMessageOutcome({ recipient, body }: { recipient: string; body: string }): Promise<MessageComposeOutcome> {
  if (!(await canSendMessage())) throw new TaskActionError('unavailable');
  try {
    const { result } = await SMS.sendSMSAsync([recipient], body);
    return result === 'sent' ? 'submitted' : result === 'cancelled' ? 'cancelled' : 'unknown';
  } catch {
    return 'failed';
  }
}

/**
 * Opens the message composer. `messageComposeViewController(_:didFinishWith:)`
 * (TaskActionComposers.swift:37-39) maps `.sent` to submitted, `.cancelled` to cancelled and
 * anything else to failed — SMS has no "saved" outcome.
 *
 * Task actions have no "opened" state to record, so an unverifiable outcome stays `failed` here.
 */
export async function composeMessage(input: { recipient: string; body: string }): Promise<ActionComposeResult> {
  const outcome = await composeMessageOutcome(input);
  return outcome === 'unknown' ? 'failed' : outcome;
}

/**
 * Opens the mail composer. `mailComposeController(_:didFinishWith:error:)`
 * (TaskActionComposers.swift:61-69) maps sent → submitted, saved → saved, cancelled → cancelled, and
 * an error or anything else → failed.
 */
export async function composeEmail(draft: ActionEmailDraft): Promise<ActionComposeResult> {
  if (!(await canSendEmail())) throw new TaskActionError('unavailable');
  try {
    const { status } = await MailComposer.composeAsync({
      recipients: [draft.recipient],
      subject: draft.subject,
      body: draft.body,
      isHtml: false,
    });
    return status === MailComposer.MailComposerStatus.SENT
      ? 'submitted'
      : status === MailComposer.MailComposerStatus.SAVED
        ? 'saved'
        : status === MailComposer.MailComposerStatus.CANCELLED
          ? 'cancelled'
          : 'failed';
  } catch {
    return 'failed';
  }
}

/**
 * `placeCall()`'s number check (TaskActionView.swift:278-288) —
 * "Do not turn an extension, pause, or vanity number into a different number."
 *
 * Returns the `tel:` URL, or `null` when the stored number is not something that can be dialled
 * as-is. Pure, so the whole rule is tested without a device.
 */
export function telUrl(value: string): string | null {
  // Every character must be one Swift allows; a vanity number or a "x123" extension is refused.
  if (![...value].every((character) => '+0123456789 ()-.'.includes(character))) return null;
  const number = [...value].filter((character) => '+0123456789'.includes(character)).join('');
  // A second "+" anywhere after the first character means two numbers ran together.
  if (number.slice(1).includes('+')) return null;
  if ([...number].filter((character) => character >= '0' && character <= '9').length < 3) return null;
  return `tel:${number}`;
}

/** `UIApplication.shared.open(url)` (TaskActionView.swift:290). */
export async function placeCall(value: string): Promise<boolean> {
  const url = telUrl(value);
  if (url === null) throw new TaskActionError('invalidPhone');
  try {
    await Linking.openURL(url);
    return true;
  } catch {
    return false;
  }
}
