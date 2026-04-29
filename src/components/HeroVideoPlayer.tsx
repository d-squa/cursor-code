import { useState, useEffect, useRef, useCallback } from "react";
import { Play } from "lucide-react";

interface HeroVideoPlayerProps {
  videoId?: string;
  /** CSS selector to scroll to after video ends or fullscreen exits (default: "#pricing") */
  scrollToAfter?: string;
}

const DEFAULT_VIDEO_ID = "YzAp9xpDbrQ";

function scrollToElement(selector: string) {
  const el = document.querySelector(selector);
  if (el) {
    el.scrollIntoView({ behavior: "smooth", block: "start" });
  }
}

export default function HeroVideoPlayer({
  videoId = DEFAULT_VIDEO_ID,
  scrollToAfter = "#pricing",
}: HeroVideoPlayerProps) {
  const [isPlaying, setIsPlaying] = useState(false);
  const hasScrolledRef = useRef(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const iframeRef = useRef<HTMLIFrameElement>(null);

  const thumbnailUrl = "/video-thumbnail.gif";

  const scrollToPricing = useCallback(() => {
    if (!hasScrolledRef.current) {
      hasScrolledRef.current = true;
      setTimeout(() => scrollToElement(scrollToAfter), 300);
    }
  }, [scrollToAfter]);

  const requestFullscreen = useCallback(() => {
    const iframe = iframeRef.current;
    if (!iframe) return;
    try {
      const requestFs =
        iframe.requestFullscreen ||
        (iframe as any).webkitRequestFullscreen ||
        (iframe as any).webkitEnterFullscreen ||
        (iframe as any).msRequestFullscreen;
      requestFs?.call(iframe);
    } catch {
      // Fullscreen may be blocked — video still plays inline
    }
  }, []);

  const startPlaying = useCallback(() => {
    hasScrolledRef.current = false;
    setIsPlaying(true);
    // Wait for iframe to mount before requesting fullscreen
    setTimeout(requestFullscreen, 300);
  }, [requestFullscreen]);

  // Listen for fullscreen exit → scroll to pricing
  useEffect(() => {
    if (!isPlaying) return;

    const handleFullscreenChange = () => {
      const isFullscreen =
        document.fullscreenElement ||
        (document as any).webkitFullscreenElement ||
        (document as any).msFullscreenElement;

      if (!isFullscreen && isPlaying) {
        scrollToPricing();
      }
    };

    document.addEventListener("fullscreenchange", handleFullscreenChange);
    document.addEventListener("webkitfullscreenchange", handleFullscreenChange);
    return () => {
      document.removeEventListener("fullscreenchange", handleFullscreenChange);
      document.removeEventListener("webkitfullscreenchange", handleFullscreenChange);
    };
  }, [isPlaying, scrollToPricing]);

  // Listen for YouTube postMessage to detect video end
  useEffect(() => {
    if (!isPlaying) return;

    const handleMessage = (event: MessageEvent) => {
      try {
        const data = typeof event.data === "string" ? JSON.parse(event.data) : event.data;
        if (data?.event === "onStateChange" && data?.info === 0) {
          scrollToPricing();
        }
      } catch {
        // Ignore non-JSON messages
      }
    };

    window.addEventListener("message", handleMessage);
    return () => window.removeEventListener("message", handleMessage);
  }, [isPlaying, scrollToPricing]);

  // External CTA trigger
  useEffect(() => {
    const handler = () => {
      containerRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
      setTimeout(startPlaying, 400);
    };
    window.addEventListener("play-hero-video", handler);
    return () => window.removeEventListener("play-hero-video", handler);
  }, [startPlaying]);

  return (
    <div ref={containerRef} id="hero-video" className="w-full max-w-3xl mx-auto mt-8 md:mt-12">
      <div className="relative w-full rounded-xl overflow-hidden shadow-lg border border-border bg-card aspect-video">
        {!isPlaying ? (
          <button
            type="button"
            onClick={startPlaying}
            className="group absolute inset-0 w-full h-full cursor-pointer"
            aria-label="Play video"
          >
            <img
              src={thumbnailUrl}
              alt="ActiPlan Explainer Video Preview"
              className="absolute inset-0 w-full h-full object-cover"
            />
            <span className="absolute inset-0 flex items-center justify-center bg-background/20 group-hover:bg-background/30 transition-colors">
              <span className="flex items-center justify-center w-20 h-20 rounded-full bg-primary text-primary-foreground shadow-xl group-hover:scale-110 transition-transform">
                <Play className="h-10 w-10 ml-1" fill="currentColor" />
              </span>
            </span>
          </button>
        ) : (
          <iframe
            ref={iframeRef}
            src={`https://www.youtube-nocookie.com/embed/${videoId}?autoplay=1&rel=0&modestbranding=1&enablejsapi=1&playsinline=1`}
            title="ActiPlan Explainer Video"
            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; fullscreen"
            allowFullScreen
            className="absolute inset-0 w-full h-full"
          />
        )}
      </div>
    </div>
  );
}

/** Call this from any button to scroll to the video and auto-play it */
export function triggerHeroVideo() {
  window.dispatchEvent(new CustomEvent("play-hero-video"));
}
