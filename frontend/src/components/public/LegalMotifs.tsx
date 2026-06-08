import { useState } from 'react';
import { FaBalanceScale, FaGavel } from 'react-icons/fa';
import heroBgUrl from '../../assets/marketing/hero.png?url';

/** Vite `public/` URLs respect `base` in production (e.g. deployed under /app/). */
function publicAsset(relativePath: string): string {
  const p = relativePath.replace(/^\//, '');
  const base = import.meta.env.BASE_URL || '/';
  if (!base || base === '/') return `/${p}`;
  return `${base.endsWith('/') ? base : `${base}/`}${p}`;
}

function isAbsoluteUrl(s: string) {
  return /^https?:\/\//i.test(s);
}

/**
 * Home hero atmosphere — layer stack (bottom → top):
 * z-0  Base ink + photograph
 * z-10 Dark scrim (readability, premium navy)
 * z-20 Decorative (aurora, beams, motifs, grain)
 */
export function HomeHeroLegalAtmosphere() {
  const rawHero = import.meta.env.VITE_HOME_HERO_IMAGE as string | undefined;
  const heroImgEnv = typeof rawHero === 'string' && rawHero.trim() ? rawHero.trim() : undefined;
  const publicFallback = publicAsset('marketing/hero.png');
  const fromEnv = heroImgEnv
    ? isAbsoluteUrl(heroImgEnv)
      ? heroImgEnv
      : publicAsset(heroImgEnv.replace(/^\//, ''))
    : null;
  const candidates = fromEnv ? [fromEnv, heroBgUrl, publicFallback] : [heroBgUrl, publicFallback];
  const [imgIndex, setImgIndex] = useState(0);
  const photoSrc = candidates[imgIndex];
  const showPhoto = imgIndex < candidates.length && Boolean(photoSrc);

  return (
    <div className="pointer-events-none absolute inset-0 min-h-full w-full overflow-hidden">
      {/* z-0 — fallback ink (does not cover photo: photo paints above in DOM) */}
      <div className="absolute inset-0 z-0 bg-[#050a14]" aria-hidden />

      {showPhoto ? (
        <div className="absolute inset-0 z-0" aria-hidden>
          <img
            key={photoSrc}
            src={photoSrc}
            alt=""
            aria-hidden
            onError={() => setImgIndex((i) => Math.min(i + 1, candidates.length))}
            className="absolute inset-0 h-full w-full object-cover object-[center_35%] opacity-90"
            decoding="async"
            loading="eager"
            fetchPriority="high"
          />
        </div>
      ) : null}

      {/* z-10 — dark legal scrim (replaces heavy grey washes on top of the photo) */}
      <div
        className="absolute inset-0 z-10 bg-gradient-to-r from-slate-950/90 via-slate-950/65 to-slate-900/35"
        aria-hidden
      />
      <div
        className="absolute inset-0 z-10 bg-gradient-to-b from-transparent via-slate-950/20 to-slate-950/55"
        aria-hidden
      />
      <div
        className="absolute inset-0 z-10 opacity-40"
        style={{
          background:
            'radial-gradient(ellipse 85% 55% at 100% 0%, rgba(37,99,235,0.18) 0%, transparent 52%), radial-gradient(ellipse 70% 50% at 0% 100%, rgba(201,162,39,0.08) 0%, transparent 48%)',
        }}
        aria-hidden
      />

      {/* z-20 — decorative only */}
      <div
        className="lk-hero-aurora pointer-events-none absolute left-[38%] top-[-18%] z-20 h-[min(420px,95vw)] w-[min(420px,95vw)] rounded-full bg-blue-500/18 blur-[95px]"
        aria-hidden
      />
      <div className="pointer-events-none absolute inset-0 z-20 overflow-hidden" aria-hidden>
        <div className="absolute -left-[20%] top-[-10%] h-[120%] w-[55%] -rotate-[18deg] bg-gradient-to-r from-white/[0.06] via-white/[0.02] to-transparent blur-[2px]" />
        <div className="absolute -right-[15%] bottom-[-20%] h-[90%] w-[45%] rotate-[12deg] bg-gradient-to-l from-blue-400/[0.07] via-transparent to-transparent blur-sm" />
      </div>
      <div
        className="pointer-events-none absolute bottom-[10%] left-[3%] top-[24%] z-20 hidden w-10 flex-col items-center justify-end gap-4 opacity-[0.11] sm:flex lg:left-[5%]"
        aria-hidden
      >
        <div className="h-[28%] w-[5px] rounded-full bg-gradient-to-t from-amber-200/50 via-white/20 to-transparent shadow-[0_0_20px_rgba(251,191,36,0.15)]" />
        <div className="h-[40%] w-[6px] rounded-full bg-gradient-to-t from-white/35 via-blue-200/15 to-transparent" />
        <div className="h-[22%] w-[4px] rounded-full bg-gradient-to-t from-white/25 to-transparent" />
      </div>
      <FaGavel
        className="pointer-events-none absolute left-[2%] top-[8%] z-20 text-[min(120px,28vw)] rotate-12 text-white/[0.04] sm:left-[4%] sm:top-[12%] sm:text-[min(140px,22vw)]"
        aria-hidden
      />
      <FaBalanceScale
        className="pointer-events-none absolute bottom-[6%] right-[4%] z-20 text-[min(200px,38vw)] text-white/[0.05] sm:right-[8%] sm:text-[min(220px,32vw)]"
        aria-hidden
      />
      <div
        className="pointer-events-none absolute inset-0 z-20 opacity-[0.05]"
        style={{
          backgroundImage: 'radial-gradient(rgba(255,255,255,0.14) 1px, transparent 1px)',
          backgroundSize: '24px 24px',
        }}
        aria-hidden
      />
    </div>
  );
}

/** Institutional About hero: column wash + faint scales */
export function AboutHeroTrustWash() {
  return (
    <>
      <div className="pointer-events-none absolute inset-0 bg-gradient-to-br from-[#0a1628] via-[#12355B] to-[#0c1829]" aria-hidden />
      <div
        className="pointer-events-none absolute inset-0 opacity-90 lk-gradient-shift"
        style={{
          background:
            'radial-gradient(ellipse 100% 70% at 0% 0%, rgba(37,99,235,0.18) 0%, transparent 50%), radial-gradient(ellipse 80% 60% at 100% 100%, rgba(201,162,39,0.06) 0%, transparent 45%)',
        }}
        aria-hidden
      />
      <FaBalanceScale className="pointer-events-none absolute left-[6%] top-[18%] text-[min(160px,40vw)] -rotate-6 text-white/[0.04]" aria-hidden />
      <div
        className="pointer-events-none absolute inset-0 opacity-[0.04]"
        style={{ backgroundImage: 'linear-gradient(90deg, transparent 49%, rgba(255,255,255,0.06) 50%, transparent 51%)', backgroundSize: '48px 100%' }}
        aria-hidden
      />
    </>
  );
}

/** Contact / support hero: airy light wash, soft motion, minimal legal watermark */
export function ContactHeroSupportWash() {
  return (
    <>
      <div className="pointer-events-none absolute inset-0 bg-gradient-to-br from-[#f3f8ff] via-white to-[#eef2ff]" aria-hidden />
      <div
        className="pointer-events-none absolute inset-0 opacity-[0.55] lk-gradient-shift"
        style={{
          background:
            'radial-gradient(ellipse 90% 55% at 90% 0%, rgba(37,99,235,0.12) 0%, transparent 52%), radial-gradient(ellipse 70% 50% at 0% 100%, rgba(99,102,241,0.08) 0%, transparent 48%)',
        }}
        aria-hidden
      />
      <div
        className="pointer-events-none absolute inset-0 opacity-[0.055]"
        style={{
          backgroundImage: 'radial-gradient(rgb(15 23 42 / 0.12) 1px, transparent 1px)',
          backgroundSize: '20px 20px',
        }}
        aria-hidden
      />
      <FaBalanceScale
        className="pointer-events-none absolute right-[5%] top-[10%] text-[min(96px,26vw)] text-blue-900/[0.045]"
        aria-hidden
      />
    </>
  );
}
