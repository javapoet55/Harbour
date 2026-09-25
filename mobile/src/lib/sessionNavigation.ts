import { router } from 'expo-router';

/**
 * Leaving the signed-in screens when the session ends (Sign out, Delete account).
 *
 * Expo Router QUEUES every navigation action (`routingQueue`, expo-router/build/global-state/
 * router.js) and dispatches it after the next render. The session gate in app/_layout.tsx removes
 * every signed-in stack in that same render once the store flips to `signedOut` — so a dismissal
 * issued AT or AFTER the flip lands on a stack that no longer exists: "The action 'POP_TO_TOP' (or
 * 'GO_BACK') was not handled by any navigator".
 *
 * So the order is fixed here: close what is presented WHILE the stacks exist, and only if there is
 * something to close (`canDismiss` / `canGoBack`), waiting a frame for each queued action to be
 * dispatched; then the caller ends the session; then `replaceWithSignIn`. Nothing is ever sent to an
 * empty stack.
 */

/** One frame: long enough for Expo Router to render and run its queued action. */
const nextFrame = () => new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));

/** Close anything pushed or presented over the tabs, if — and only if — there is something to close. */
export async function closePresentedScreens(): Promise<void> {
  if (router.canDismiss()) {
    router.dismissAll();
    await nextFrame();
  }
  if (router.canGoBack()) {
    router.back();
    await nextFrame();
  }
}

/** After the session has ended: a fresh stack on Sign in, never "back" into a removed one. */
export function replaceWithSignIn(): void {
  router.replace('/sign-in');
}
