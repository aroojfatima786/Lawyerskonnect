import { useState } from 'react';
import { FaPlay } from 'react-icons/fa';

/** Stock demo — legal consultation theme (Pexels, free to use). */
const DEFAULT_DEMO_MP4 =
  'https://videos.pexels.com/video-files/7594043/7594043-hd_1366_768_25fps.mp4';

function toYouTubeEmbed(url: string): string | null {
  try {
    const u = new URL(url.trim());
    if (u.hostname.includes('youtube.com') && u.searchParams.get('v')) {
      return `https://www.youtube.com/embed/${u.searchParams.get('v')}`;
    }
    if (u.hostname === 'youtu.be') {
      const id = u.pathname.replace(/^\//, '');
      if (id) return `https://www.youtube.com/embed/${id}`;
    }
    if (u.hostname.includes('youtube.com') && u.pathname.startsWith('/embed/')) {
      return url.trim();
    }
  } catch {
    return null;
  }
  return null;
}

function DemoVideoShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="relative mx-auto w-full max-w-md lg:max-w-none">
      <div className="absolute -left-6 -top-8 hidden h-32 w-32 rounded-full bg-blue-500/30 blur-3xl lg:block" aria-hidden />
      <div className="relative overflow-hidden rounded-2xl border border-white/25 bg-slate-950/50 shadow-[0_28px_80px_-20px_rgba(0,0,0,0.6)] ring-2 ring-amber-400/20">
        <div className="absolute left-4 top-4 z-10 flex items-center gap-2">
          <span className="rounded-md bg-gradient-to-r from-blue-600 to-indigo-700 px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide text-white shadow-lg ring-1 ring-white/20">
            Demo preview
          </span>
          <span className="hidden rounded-full border border-white/20 bg-black/40 px-2 py-0.5 text-[10px] font-medium text-white/80 backdrop-blur-sm sm:inline">
            Sample footage
          </span>
        </div>
        {children}
        <div className="pointer-events-none absolute inset-x-0 bottom-0 h-24 bg-gradient-to-t from-slate-950/90 via-slate-950/40 to-transparent" aria-hidden />
        <p className="pointer-events-none absolute bottom-3 left-4 right-4 z-10 text-[11px] leading-snug text-white/75">
          Illustrative demo — book verified lawyers on LawyersKonnect for real consultations.
        </p>
      </div>
    </div>
  );
}

/**
 * Home hero media column: env override or built-in stock demo video.
 * Env: `VITE_HOME_VIDEO_URL`, `VITE_HOME_HERO_DEMO_FILE`, `VITE_HOME_HERO_VIDEO_POSTER`
 */
export function HomeHeroDemoMedia() {
  const rawVideo = (import.meta.env.VITE_HOME_VIDEO_URL as string | undefined)?.trim();
  const localFile = (import.meta.env.VITE_HOME_HERO_DEMO_FILE as string | undefined)?.trim();
  const poster = (import.meta.env.VITE_HOME_HERO_VIDEO_POSTER as string | undefined)?.trim();
  const [videoFailed, setVideoFailed] = useState(false);

  const shellInner = 'aspect-video w-full object-cover';

  if (localFile) {
    return (
      <DemoVideoShell>
        <video className={shellInner} controls playsInline preload="metadata" poster={poster || undefined} aria-label="LawyersKonnect product demo">
          <source src={localFile} />
        </video>
      </DemoVideoShell>
    );
  }

  if (rawVideo) {
    const lower = rawVideo.toLowerCase();
    if (lower.endsWith('.mp4') || lower.endsWith('.webm') || lower.startsWith('/')) {
      return (
        <DemoVideoShell>
          <video className={shellInner} controls playsInline preload="metadata" poster={poster || undefined} aria-label="LawyersKonnect product demo">
            <source src={rawVideo} />
          </video>
        </DemoVideoShell>
      );
    }

    const embed = toYouTubeEmbed(rawVideo) ?? (rawVideo.includes('embed') ? rawVideo : null);
    if (embed) {
      return (
        <DemoVideoShell>
          <div className="relative aspect-video w-full">
            <iframe
              src={embed}
              title="LawyersKonnect demo video"
              className="absolute inset-0 h-full w-full"
              allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
              allowFullScreen
              loading="lazy"
              referrerPolicy="strict-origin-when-cross-origin"
            />
          </div>
        </DemoVideoShell>
      );
    }
  }

  if (videoFailed) {
    return (
      <DemoVideoShell>
        <div className="flex aspect-video flex-col items-center justify-center gap-3 bg-gradient-to-br from-slate-900 via-[#102A43] to-slate-950 px-6 text-center">
          <div className="flex h-14 w-14 items-center justify-center rounded-full border border-white/20 bg-white/10 text-white ring-2 ring-amber-400/25">
            <FaPlay className="ml-0.5 text-xl" aria-hidden />
          </div>
          <p className="text-sm font-semibold text-white">Platform walkthrough</p>
          <p className="max-w-xs text-xs text-white/65">Find a lawyer, book a slot, and pay through secure checkout.</p>
        </div>
      </DemoVideoShell>
    );
  }

  return (
    <DemoVideoShell>
      <video
        className={shellInner}
        autoPlay
        muted
        loop
        playsInline
        preload="metadata"
        poster={poster || undefined}
        aria-label="LawyersKonnect demo preview"
        onError={() => setVideoFailed(true)}
      >
        <source src={DEFAULT_DEMO_MP4} type="video/mp4" />
      </video>
    </DemoVideoShell>
  );
}
