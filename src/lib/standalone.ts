type StandaloneEnv = {
  matchMedia: (query: string) => { matches: boolean };
  navigator: { standalone?: boolean };
};

/**
 * Opened from the home screen rather than a browser tab. iOS Safari reports it on
 * `navigator.standalone`; everything else through the display-mode media query.
 */
export function isStandalone({ matchMedia, navigator }: StandaloneEnv): boolean {
  return matchMedia("(display-mode: standalone)").matches || navigator.standalone === true;
}
