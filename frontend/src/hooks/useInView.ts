import { useEffect, useRef, useState, type RefObject } from 'react';

export type UseInViewOptions = {
  rootMargin?: string;
  threshold?: number;
  /**
   * `true`: first time the element enters the viewport, then stop observing.
   * `false` (default): toggles whenever the element enters/leaves — use with scroll replay animations.
   */
  once?: boolean;
};

/**
 * Tracks whether the element intersects the viewport.
 * When `once` is false, visibility follows intersection (off-screen sections reset so animations can replay on re-entry).
 */
export function useInView<T extends Element = HTMLElement>(options?: UseInViewOptions): [RefObject<T | null>, boolean] {
  const ref = useRef<T | null>(null);
  const [visible, setVisible] = useState(false);
  const { rootMargin = '0px 0px -8% 0px', threshold = 0.12, once = false } = options ?? {};

  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    const io = new IntersectionObserver(
      ([entry]) => {
        const isOn = !!entry?.isIntersecting;
        if (once) {
          if (isOn) {
            setVisible(true);
            io.disconnect();
          }
        } else {
          setVisible(isOn);
        }
      },
      { rootMargin, threshold },
    );

    io.observe(el);
    return () => io.disconnect();
  }, [once, rootMargin, threshold]);

  return [ref, visible];
}
