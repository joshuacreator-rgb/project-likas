/**
 * Click-to-play facade for the built-in safety advice videos
 * (client change, backlog s18).
 *
 * The thumbnail is the only request made up front, and it fires only when a
 * resident expands an advice card. The youtube-nocookie.com player itself is
 * requested on the click, so the citizen home page never contacts YouTube
 * while rendering. If the thumbnail host is unreachable (blocked or flaky
 * venue networks), the image degrades to a plain tile that keeps the play
 * control usable - the advice text stays the load-bearing content either way.
 *
 * The video id is validated here as defence in depth even though the shared
 * content test already enforces the format: only 11-character YouTube ids
 * ever reach a URL.
 */

import { useState } from "react";
import { Play } from "lucide-react";

const YOUTUBE_ID = /^[\w-]{11}$/;

export function VideoFacade({ videoId, label }: { videoId: string; label: string }) {
  const [playing, setPlaying] = useState(false);
  const [thumbFailed, setThumbFailed] = useState(false);
  if (!YOUTUBE_ID.test(videoId)) return null;

  if (playing) {
    return (
      <div className="citizen-advice-video">
        <iframe
          src={`https://www.youtube-nocookie.com/embed/${videoId}?rel=0&playsinline=1&autoplay=1`}
          title={label}
          allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
          allowFullScreen
        />
      </div>
    );
  }

  return (
    <div className="citizen-advice-video">
      <button type="button" onClick={() => setPlaying(true)} aria-label={label}>
        {!thumbFailed && (
          <img
            src={`https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`}
            alt=""
            loading="lazy"
            onError={() => setThumbFailed(true)}
          />
        )}
        <span className="citizen-advice-video-play" aria-hidden="true">
          <Play size={26} fill="currentColor" />
        </span>
      </button>
    </div>
  );
}
