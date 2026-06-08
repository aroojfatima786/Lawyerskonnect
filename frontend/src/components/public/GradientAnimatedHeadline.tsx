import { useEffect, useMemo, useState } from 'react';
import { usePrefersReducedMotion } from '../../hooks/usePrefersReducedMotion';

type Mode = 'words' | 'letters';

export function GradientAnimatedHeadline({
  lines,
  mode = 'words',
  className = '',
  lineClassName = '',
}: {
  lines: string[];
  mode?: Mode;
  className?: string;
  lineClassName?: string;
}) {
  const prefersReducedMotion = usePrefersReducedMotion();
  const [lineIdx, setLineIdx] = useState(0);
  const [visibleCount, setVisibleCount] = useState(0);

  const line = lines[lineIdx] ?? '';
  const units = useMemo(() => (mode === 'letters' ? line.split('') : line.split(/\s+/).filter(Boolean)), [line, mode]);

  useEffect(() => {
    if (prefersReducedMotion) {
      setVisibleCount(units.length);
      return;
    }
    setVisibleCount(0);
    let shown = 0;
    const stagger = mode === 'letters' ? 42 : 95;
    const holdMs = 2800;
    let pauseTimer: ReturnType<typeof setTimeout> | undefined;
    const intervalId = window.setInterval(() => {
      shown += 1;
      setVisibleCount(Math.min(shown, units.length));
      if (shown >= units.length) {
        window.clearInterval(intervalId);
        pauseTimer = window.setTimeout(() => {
          setLineIdx((i) => (i + 1) % lines.length);
        }, holdMs);
      }
    }, stagger);
    return () => {
      window.clearInterval(intervalId);
      if (pauseTimer) window.clearTimeout(pauseTimer);
    };
  }, [lineIdx, prefersReducedMotion, units.length, mode, lines.length]);

  const gradientText =
    'bg-gradient-to-r from-[#1e3a8f] via-[#2563eb] to-[#7c3aed] bg-clip-text text-transparent';

  return (
    <h2 className={`font-serif font-semibold leading-snug ${className}`} aria-live="polite">
      {units.map((unit, i) => {
        const visible = prefersReducedMotion || i < visibleCount;
        const isSpace = unit === ' ';
        return (
          <span
            key={`${lineIdx}-${i}-${unit}`}
            className={`inline-block transition-all duration-300 ${
              visible ? `opacity-100 translate-y-0 ${isSpace ? '' : gradientText}` : 'opacity-0 translate-y-2'
            } ${lineClassName}`}
            style={{ transitionDelay: prefersReducedMotion ? undefined : `${i * 28}ms` }}
          >
            {unit}
            {mode === 'words' && i < units.length - 1 ? '\u00a0' : null}
          </span>
        );
      })}
    </h2>
  );
}
