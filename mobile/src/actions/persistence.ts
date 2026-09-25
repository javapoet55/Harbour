import * as Crypto from 'expo-crypto';
import { Directory, File, Paths } from 'expo-file-system';

import type { StoredTaskAction } from '../lib/taskAction';

/**
 * The coordinator's on-disk state (ios/App/TaskActionCoordinator.swift:33-41, `:126-138`).
 *
 * Swift writes ONE JSON FILE PER ACCOUNT, at
 * `Application Support/TaskActions/<sha256(userID)>.json`, atomically, excluded from backup and with
 * `.completeFileProtectionUntilFirstUserAuthentication`. It is a file rather than `UserDefaults`
 * because it holds contact identifiers and scheduling state, not a preference.
 *
 * This reproduces the layout with `expo-file-system`: `Paths.document/TaskActions/<key>.json`.
 * AsyncStorage is deliberately NOT used — it is the UserDefaults analogue, and this is not that.
 *
 * DIVERGENCE: the two iOS file attributes have no Expo equivalent. On Android the app's files
 * directory is already private to the app and excluded from auto-backup only if the manifest says
 * so; that is recorded under Visual gaps rather than faked here.
 */

const DIRECTORY = 'TaskActions';

/** `ownerKey(_:)` (TaskActionCoordinator.swift:43-45): SHA-256 of the user id, lowercase hex. */
export async function ownerKeyFor(userId: string): Promise<string> {
  return Crypto.digestStringAsync(Crypto.CryptoDigestAlgorithm.SHA256, userId, {
    encoding: Crypto.CryptoEncoding.HEX,
  });
}

function fileFor(owner: string): File {
  return new File(new Directory(Paths.document, DIRECTORY), `${owner}.json`);
}

/**
 * Reads the saved actions. Resolves to `null` when nothing has been saved, and THROWS when a file
 * exists but cannot be parsed — `activate` turns that into Swift's "couldn't be read" notice
 * (TaskActionCoordinator.swift:50-53) rather than silently starting empty.
 */
export async function readActions(owner: string): Promise<StoredTaskAction[] | null> {
  const file = fileFor(owner);
  if (!file.exists) return null;
  const contents = file.textSync();
  const parsed: unknown = JSON.parse(contents);
  if (!Array.isArray(parsed)) throw new Error('Saved actions are not a list.');
  return parsed as StoredTaskAction[];
}

/** `persist()` (TaskActionCoordinator.swift:126-138). Throws so the caller can set the notice. */
export async function writeActions(owner: string, actions: StoredTaskAction[]): Promise<void> {
  const directory = new Directory(Paths.document, DIRECTORY);
  if (!directory.exists) directory.create({ intermediates: true });
  fileFor(owner).write(JSON.stringify(actions));
}

/** Used by sign-out and account deletion; Swift drops the in-memory copy and leaves the file. */
export async function clearActions(owner: string): Promise<void> {
  const file = fileFor(owner);
  if (file.exists) file.delete();
}
