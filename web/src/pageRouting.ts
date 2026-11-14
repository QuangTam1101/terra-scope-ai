export type RoutedPage = 'landing' | 'start' | 'home' | 'explore' | 'forecast' | 'hunt' | 'detective' | 'report';

/**
 * Keep browser back/forward and direct hashes within supported pages.
 * - No hash, "#", "#/" or "#landing": the public landing page.
 * - "#start": the experience choice (Explorer or Scientist) shown after Get Started.
 * - "#home", "#explore", "#forecast", "#hunt", "#detective", "#report" (and "#/explore" style): the application pages.
 * - Any other hash: the application guide (Home), never an empty screen and never a redirect loop.
 */
export function pageFromHash(hash: string): RoutedPage {
  const page = hash.replace(/^#\/?/, '').split('?')[0];   // "#report?case=..." opens Report with a saved case
  if (page === '' || page === 'landing') return 'landing';
  return page === 'start' || page === 'explore' || page === 'forecast' || page === 'hunt' || page === 'detective' || page === 'report' ? page : 'home';
}
