import { useState } from "react";
import { Play } from "lucide-react";

interface HeroVideoPlayerProps {
  /** YouTube video ID (the part after v= in a YouTube URL) */
  videoId?: string;
}

const DEFAULT_VIDEO_ID = "dQw4w9WgXcQ"; // Placeholder — replace with your explainer video ID

export default function HeroVideoPlayer({ videoId = DEFAULT_VIDEO_ID }: HeroVideoPlayerProps) {
  const [isPlaying, setIsPlaying] = useState(false);

  const thumbnailUrl = `https://img.youtube.com/vi/${videoId}/maxresdefault.jpg`;

  return (
    <div className="w-full max-w-3xl mx-auto mt-8 md:mt-12">
      <div className="relative w-full rounded-xl overflow-hidden shadow-lg border border-border bg-card aspect-video group">
        {isPlaying ? (
          <iframe
            src={`https://www.youtube-nocookie.com/embed/${videoId}?autoplay=1&rel=0&modestbranding=1`}
            title="ActiPlan Explainer Video"
            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
            allowFullScreen
            className="absolute inset-0 w-full h-full"
          />
        ) : (
          <button
            onClick={() => setIsPlaying(true)}
            className="absolute inset-0 w-full h-full cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
            aria-label="Play explainer video"
          >
            {/* Thumbnail */}
            <img
              src={thumbnailUrl}
              alt="ActiPlan explainer video thumbnail"
              className="w-full h-full object-cover"
              loading="lazy"
            />

            {/* Dark overlay */}
            <div className="absolute inset-0 bg-foreground/20 group-hover:bg-foreground/30 transition-colors duration-300" />

            {/* Play button */}
            <div className="absolute inset-0 flex items-center justify-center">
              <div className="flex items-center justify-center w-16 h-16 md:w-20 md:h-20 rounded-full bg-primary/90 text-primary-foreground shadow-xl group-hover:scale-110 transition-transform duration-300">
                <Play className="h-7 w-7 md:h-9 md:w-9 ml-1" fill="currentColor" />
              </div>
            </div>

            {/* Label */}
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
