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

  const startPlaying = () => {
    hasScrolledRef.current = false;
    setIsPlaying(true);
    setTimeout(() => {
      try {
        const iframe = iframeRef.current;
        if (iframe) {
          const requestFs =
            iframe.requestFullscreen || (iframe as any).webkitRequestFullscreen || (iframe as any).msRequestFullscreen;
          requestFs?.call(iframe);
        }
      } catch {
        // Fullscreen may be blocked by browser — video still plays inline
      }
    }, 600);
  };

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
        // YouTube sends JSON messages for player state changes
        const data = typeof event.data === "string" ? JSON.parse(event.data) : event.data;
        // State 0 = ended
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

  // CTA button trigger
  useEffect(() => {
    const handler = () => {
      containerRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
      setTimeout(startPlaying, 400);
    };
    window.addEventListener("play-hero-video", handler);
    return () => window.removeEventListener("play-hero-video", handler);
  }, []);

  return (
    <div ref={containerRef} id="hero-video" className="w-full max-w-3xl mx-auto mt-8 md:mt-12">
      <div className="relative w-full rounded-xl overflow-hidden shadow-lg border border-border bg-card aspect-video">
        <iframe
          ref={iframeRef}
          src={`https://www.youtube-nocookie.com/embed/${videoId}?rel=0&modestbranding=1&enablejsapi=1`}
          title="ActiPlan Explainer Video"
          allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; fullscreen"
          allowFullScreen
          className="absolute inset-0 w-full h-full"
        />
      </div>
    </div>
  );
}

/** Call this from any button to scroll to the video and auto-play it */
export function triggerHeroVideo() {
  window.dispatchEvent(new CustomEvent("play-hero-video"));
}
