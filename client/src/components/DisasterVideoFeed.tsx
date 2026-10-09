/**
 * "Pinakabagong Balita sa Sakuna" video section for the citizen dashboard
 * (client change, §24). The first video is featured and large; up to two
 * more render as smaller cards. Every video reuses the click-to-play
 * VideoFacade from §18 rather than embedding raw iframes, so the page never
 * contacts the YouTube player until a resident chooses to watch.
 */

import { newsCopy, type NewsFeedState, type NewsVideo } from "../../../shared/news";
import type { CitizenLanguage } from "../../../shared/citizen";
import { Skeleton } from "@/components/ui/skeleton";
import { VideoFacade } from "./VideoFacade";

export function DisasterVideoFeed({
  state,
  language,
}: {
  state: NewsFeedState<NewsVideo>;
  language: CitizenLanguage;
}) {
  const t = newsCopy[language];

  if (state.status === "loading") {
    return (
      <section className="citizen-news-section" aria-hidden="true">
        <div className="citizen-section-head">
          <div>
            <span className="eyebrow">{t.videosEyebrow}</span>
            <h2>{t.videoSectionTitle}</h2>
            <p>{t.videoSectionHelp}</p>
          </div>
        </div>
        <div className="citizen-video-featured">
          <Skeleton className="citizen-news-skeleton-video" />
        </div>
        <div className="citizen-video-list">
          {[0, 1].map(index => (
            <Skeleton key={index} className="citizen-news-skeleton-video-small" />
          ))}
        </div>
      </section>
    );
  }

  const featured = state.status === "ready" ? state.items[0] : undefined;
  const rest = state.status === "ready" ? state.items.slice(1) : [];
  if (!featured) return null;

  return (
    <section className="citizen-news-section" aria-labelledby="citizen-news-videos-heading">
      <div className="citizen-section-head">
        <div>
          <span className="eyebrow">{t.videosEyebrow}</span>
          <h2 id="citizen-news-videos-heading">{t.videoSectionTitle}</h2>
          <p>{t.videoSectionHelp}</p>
        </div>
      </div>
      <div className="citizen-video-featured">
        <VideoFacade videoId={featured.videoId} label={featured.title} />
        <h3 className="citizen-video-title">{featured.title}</h3>
        <p className="citizen-video-channel">{featured.channel}</p>
      </div>
      {rest.length > 0 && (
        <div className="citizen-video-list">
          {rest.map(video => (
            <div key={video.id} className="citizen-video-card">
              <VideoFacade videoId={video.videoId} label={video.title} />
              <h3 className="citizen-video-title">{video.title}</h3>
              <p className="citizen-video-channel">{video.channel}</p>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}