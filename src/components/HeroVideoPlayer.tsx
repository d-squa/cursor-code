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
      <div className="relative w-full rounded-xl overflow-hidden shadow-lg border border-border bg-card aspect-video group">
        {isPlaying ? (
          <iframe
            ref={iframeRef}
            src={`https://www.youtube-nocookie.com/embed/${videoId}?autoplay=1&rel=0&modestbranding=1&enablejsapi=1`}
            title="ActiPlan Explainer Video"
            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; fullscreen"
            allowFullScreen
            className="absolute inset-0 w-full h-full"
          />
        ) : (
          <button
            onClick={startPlaying}
            className="absolute inset-0 w-full h-full cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
            aria-label="Play explainer video"
          >
            <img
              src={thumbnailUrl}
              alt="ActiPlan explainer video thumbnail"
              className="w-full h-full object-cover"
              loading="lazy"
            />
            <div className="absolute inset-0 bg-foreground/20 group-hover:bg-foreground/30 transition-colors duration-300" />
            <div className="absolute inset-0 flex items-center justify-center">
              <div className="flex items-center justify-center w-16 h-16 md:w-20 md:h-20 rounded-full bg-primary/90 text-primary-foreground shadow-xl group-hover:scale-110 transition-transform duration-300">
                <Play className="h-7 w-7 md:h-9 md:w-9 ml-1" fill="currentColor" />
              </div>
            </div>
            <div className="absolute bottom-4 left-1/2 -translate-x-1/2">
              <span className="text-xs md:text-sm font-medium text-primary-foreground bg-foreground/60 backdrop-blur-sm px-3 py-1 rounded-full">
                Watch how it works
              </span>
            </div>
          </button>
        )}
      </div>
    </div>
  );
}

/** Call this from any button to scroll to the video and auto-play it */
export function triggerHeroVideo() {
  window.dispatchEvent(new CustomEvent("play-hero-video"));
}
