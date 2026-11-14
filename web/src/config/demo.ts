/**
 * Product demo video configuration (Landing page, "Watch Demo").
 *
 * The landing page plays the video configured below. With { kind: "none" } it shows an explicit
 * "Product Demo: Coming Soon" frame instead. To change the video, change DEMO_VIDEO only:
 *
 *   // A local file placed in web/public/demo/ (served as /demo/...)
 *   export const DEMO_VIDEO: DemoVideo = {
 *     kind: "file", title: "Terra-scope demo", src: "/demo/terra-scope-demo.mp4",
 *     poster: "/demo/poster.jpg", captions: "/demo/terra-scope-demo.en.vtt",
 *   };
 *
 *   // Or a YouTube video (11-character id from the share link)
 *   export const DEMO_VIDEO: DemoVideo = { kind: "youtube", title: "Terra-scope demo", id: "XXXXXXXXXXX" };
 *
 * Submission rule (Space Apps): the demo video must be 30 seconds or shorter and in English or with
 * English subtitles. Provide a captions file (WebVTT) for the local MP4 option.
 */
export type DemoVideo =
  | { kind: "none" }
  | { kind: "file"; title: string; src: string; poster?: string; captions?: string }
  | { kind: "youtube"; title: string; id: string };

// Music-only promo (no speech): the English headlines are burned into the picture, so there is no captions track.
// Source and QA: media/demo/PROMO_PRODUCTION_NOTES.md. Code change AI-assisted.
export const DEMO_VIDEO: DemoVideo = {
  kind: "file", title: "Terra-Scope AI: 30-second promo", src: "/demo/terra-scope-ai-promo-30s.mp4", poster: "/demo/poster.jpg",
};

/** Only well-formed YouTube ids produce an embed URL (privacy-enhanced domain); anything else is rejected. */
export function youtubeEmbedUrl(id: string): string | null {
  return /^[\w-]{11}$/.test(id) ? `https://www.youtube-nocookie.com/embed/${id}` : null;
}

/** True when the configured video can actually be played. */
export function hasPlayableVideo(v: DemoVideo): boolean {
  if (v.kind === "file") return /^(\/|https:\/\/)[^\s]+\.(mp4|webm)$/i.test(v.src);
  if (v.kind === "youtube") return youtubeEmbedUrl(v.id) !== null;
  return false;
}
