import { useInView, type UseInViewOptions } from './useInView';
import type { RefObject } from 'react';

type Options = Pick<UseInViewOptions, 'rootMargin' | 'threshold'>;

/** First intersection only — then observer disconnects. */
export function useInViewOnce<T extends Element = HTMLElement>(options?: Options): [RefObject<T | null>, boolean] {
  return useInView<T>({ ...options, once: true });
}
