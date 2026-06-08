import { useEffect, useState, type HTMLAttributes, type ReactNode } from 'react';
import { useInView } from '../../hooks/useInView';
import { usePrefersReducedMotion } from '../../hooks/usePrefersReducedMotion';

type RevealVariant = 'up' | 'left' | 'right' | 'scale';

type RevealProps = {
  children: ReactNode;
  className?: string;
  /** Delay after the element enters the viewport (ms). */
  delayMs?: number;
  variant?: RevealVariant;
  /**
   * `false` (default): animation replays each time the block scrolls into view (resets when off-screen).
   * `true`: animate only the first time (lighter observer).
   */
  once?: boolean;
} & Omit<HTMLAttributes<HTMLDivElement>, 'children'>;

const variantClass: Record<RevealVariant, string> = {
  up: 'lk-reveal',
  left: 'lk-reveal lk-reveal-left',
  right: 'lk-reveal lk-reveal-right',
  scale: 'lk-reveal lk-reveal-scale',
};

/**
 * Scroll-triggered fade / slide. By default replays when the section re-enters the viewport.
 * Honors prefers-reduced-motion.
 */
export function Reveal({ children, className = '', delayMs = 0, variant = 'up', once = false, style, ...rest }: RevealProps) {
  const reduced = usePrefersReducedMotion();
  const [ref, inView] = useInView<HTMLDivElement>({ once });
  const [shown, setShown] = useState(reduced);

  useEffect(() => {
    if (reduced) {
      setShown(true);
      return;
    }
    if (!inView) {
      if (!once) setShown(false);
      return;
    }
    if (delayMs <= 0) {
      setShown(true);
      return;
    }
    const t = window.setTimeout(() => setShown(true), delayMs);
    return () => window.clearTimeout(t);
  }, [inView, delayMs, reduced, once]);

  return (
    <div ref={ref} className={`${variantClass[variant]} ${shown ? 'lk-reveal-on' : ''} ${className}`.trim()} style={style} {...rest}>
      {children}
    </div>
  );
}
