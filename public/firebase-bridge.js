/* Firebase Analytics for trusted WKWebView content. Safe no-op in normal browsers. */
(function () {
  'use strict';
  window.nexdoAnalytics = Object.freeze({
    logEvent: function (name, parameters) {
      var handler = window.webkit && window.webkit.messageHandlers && window.webkit.messageHandlers.firebase;
      if (!handler || typeof handler.postMessage !== 'function') return false;
      try {
        handler.postMessage({ command: 'logEvent', name: name, parameters: parameters || {} });
        return true;
      } catch (_) { return false; }
    }
  });
})();
