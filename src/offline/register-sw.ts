/**
 * Registers the service worker that keeps the app shell (and the last copy of each page)
 * on the phone. Browser only; call it from an effect. Updates apply on their own
 * (`registerType: "autoUpdate"` in vite.config.ts), so there is no prompt to answer.
 */
export function registerServiceWorker(): void {
  if (!("serviceWorker" in navigator)) return;
  void import("virtual:pwa-register").then(({ registerSW }) => registerSW({ immediate: true }));
}
