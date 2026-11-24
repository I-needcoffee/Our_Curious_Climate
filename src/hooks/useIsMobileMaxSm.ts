import { useSyncExternalStore } from 'react';

const MOBILE_OR_COARSE_QUERY = '(max-width: 639px), (hover: none), (pointer: coarse)';

/**
 * True on small viewports (< 640px) OR touch/coarse-pointer devices (iPads, tablets, touch laptops)
 * where hover-only card chrome would be unreachable.
 */
export function useIsMobileMaxSm() {
  return useSyncExternalStore(
    onChange => {
      if (typeof window === 'undefined') return () => {};
      const mql = window.matchMedia(MOBILE_OR_COARSE_QUERY);
      const on = () => onChange();
      mql.addEventListener('change', on);
      return () => mql.removeEventListener('change', on);
    },
    () => (typeof window !== 'undefined' ? window.matchMedia(MOBILE_OR_COARSE_QUERY).matches : false),
    () => false
  );
}
