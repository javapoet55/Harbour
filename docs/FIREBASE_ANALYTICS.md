# Firebase Analytics

FirebaseAnalytics 12.19.2 is linked through Swift Package Manager. App startup calls `NexdoAnalytics.configureIfAvailable()`. Analytics stays inactive if the app bundle does not contain a matching Firebase configuration; the app continues to work normally.

## Activation required

Download the **iOS** `GoogleService-Info.plist` for bundle ID `com.pinslots.nexdo` from the intended Firebase project. Place it at `ios/App/GoogleService-Info.plist` (the synchronized App group includes it as a bundle resource). Rebuild and install the native app. The project configuration has not yet been supplied, so receipt of events in Firebase has not been verified.

## Native and web usage

Native screens can call `NexdoAnalytics.logEvent("shopping_list_open", parameters: ["item_count": 8])`.

The existing application is native SwiftUI and has no embedded web screen. When adding an approved embedded page, create the web view with `FirebaseAnalyticsBridge.makeWebView(trustedOrigin: URL(string: "https://harbour-production-f8a0.up.railway.app")!)`, then load its URL. The factory registers the `firebase` message handler before loading content. It only accepts main-frame messages from that exact HTTPS origin. The handler does not retain the web view or its owning view controller.

The website loads `/firebase-bridge.js`. Trusted embedded pages can call:

```javascript
window.nexdoAnalytics.logEvent('shopping_list_open', { item_count: 8 });
```

This posts `{ command: "logEvent", name, parameters }` to `window.webkit.messageHandlers.firebase`. It is a no-op in regular browsers and does not install a separate web analytics tracker. A true return means the message was posted, not that Firebase received it.

Only event names and primitive numeric/string parameters are supported. Do not send names, email addresses, contact details, voice transcripts, wish text, or shopping notes as analytics parameters. No such automatic content collection is added here.

## Verification

Run the FirebaseBridge Swift tests and firebase-bridge JavaScript tests. After configuring the actual project, launch a debug build with `-FIRDebugEnabled`, log a test event, and verify it in that project's Firebase Analytics DebugView. Backend deployment alone cannot enable the native SDK or update an installed iOS app.

References: https://firebase.google.com/docs/analytics/webview and https://firebase.google.com/docs/analytics/ios/get-started
