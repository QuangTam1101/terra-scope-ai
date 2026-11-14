/** Keep browser back/forward and direct hashes within supported pages. */
export function pageFromHash(hash: string): 'home' | 'explore' | 'hunt' | 'detective' | 'report' {
  const page = hash.replace(/^#/, '');
  return page === 'explore' || page === 'hunt' || page === 'detective' || page === 'report' ? page : 'home';
}
