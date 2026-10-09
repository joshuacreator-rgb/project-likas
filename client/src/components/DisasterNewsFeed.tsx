/**
 * "Mga Balita at Updates" disaster-news cards for the citizen dashboard
 * (client change, §24). Articles arrive through the server-side news proxy,
 * so a missing API key or upstream failure renders the friendly
 * "news unavailable" state instead of a broken request or a crash. The
 * category tabs filter the ~10 fetched headlines client-side by keyword;
 * the 5-minute freshness window lives in the page-level react-query call.
 */

import { useState } from "react";
import {
  filterNewsByCategory,
  NEWS_CATEGORIES,
  newsCategoryLabel,
  newsCopy,
  newsRelativeTime,
  truncateNewsText,
  type NewsArticle,
  type NewsCategory,
  type NewsFeedState,
} from "../../../shared/news";
import type { CitizenLanguage } from "../../../shared/citizen";
import { Skeleton } from "@/components/ui/skeleton";

const DESCRIPTION_LIMIT = 100;

export function DisasterNewsFeed({
  state,
  language,
}: {
  state: NewsFeedState<NewsArticle>;
  language: CitizenLanguage;
}) {
  const t = newsCopy[language];
  const [category, setCategory] = useState<NewsCategory>("ALL");
  const visible =
    state.status === "ready" ? filterNewsByCategory(state.items, category) : [];

  if (state.status === "loading") {
    return (
      <section className="citizen-news-section" aria-hidden="true">
        <div className="citizen-section-head">
          <div>
            <span className="eyebrow">{t.newsEyebrow}</span>
            <h2>{t.newsSectionTitle}</h2>
            <p>{t.newsSectionHelp}</p>
          </div>
        </div>
        <div className="citizen-news-filters" role="presentation">
          {NEWS_CATEGORIES.map((_, index) => (
            <Skeleton key={index} className="citizen-news-skeleton-tab" />
          ))}
        </div>
        <div className="citizen-news-grid">
          {[0, 1, 2].map(index => (
            <div key={index} className="citizen-news-card">
              <Skeleton className="citizen-news-skeleton-image" />
              <div className="citizen-news-card-body">
                <Skeleton className="citizen-news-skeleton-line citizen-news-skeleton-line-short" />
                <Skeleton className="citizen-news-skeleton-line" />
                <Skeleton className="citizen-news-skeleton-line citizen-news-skeleton-line-wide" />
              </div>
            </div>
          ))}
        </div>
      </section>
    );
  }

  return (
    <section className="citizen-news-section" aria-labelledby="citizen-news-feed-heading">
      <div className="citizen-section-head">
        <div>
          <span className="eyebrow">{t.newsEyebrow}</span>
          <h2 id="citizen-news-feed-heading">{t.newsSectionTitle}</h2>
          <p>{t.newsSectionHelp}</p>
        </div>
      </div>
      {state.status === "unavailable" ? (
        <p className="citizen-news-empty" role="status">
          {t.newsUnavailable}
        </p>
      ) : (
        <>
          <div className="citizen-news-filters" role="group" aria-label={t.newsSectionTitle}>
            {NEWS_CATEGORIES.map(tab => (
              <button
                key={tab}
                type="button"
                className={category === tab ? "selected" : ""}
                aria-pressed={category === tab}
                onClick={() => setCategory(tab)}
              >
                {newsCategoryLabel(tab, language)}
              </button>
            ))}
          </div>
          {visible.length === 0 ? (
            <p className="citizen-news-empty">{t.noNews}</p>
          ) : (
            <div className="citizen-news-grid">
              {visible.map(article => (
                <ArticleCard key={article.id} article={article} language={language} />
              ))}
            </div>
          )}
        </>
      )}
    </section>
  );
}

function ArticleCard({
  article,
  language,
}: {
  article: NewsArticle;
  language: CitizenLanguage;
}) {
  const t = newsCopy[language];
  const [imageFailed, setImageFailed] = useState(false);

  return (
    <article className="citizen-news-card">
      {!imageFailed && article.imageUrl ? (
        <img
          src={article.imageUrl}
          alt=""
          loading="lazy"
          className="citizen-news-card-image"
          onError={() => setImageFailed(true)}
        />
      ) : (
        <div className="citizen-news-card-image citizen-news-card-image-fallback" aria-hidden="true" />
      )}
      <div className="citizen-news-card-body">
        <div className="citizen-news-card-meta">
          <span className="citizen-news-card-source">{article.source}</span>
          <time dateTime={article.publishedAt}>
            {newsRelativeTime(article.publishedAt, language)}
          </time>
        </div>
        <h3 className="citizen-news-card-title">{article.title}</h3>
        {article.description && (
          <p className="citizen-news-card-desc">
            {truncateNewsText(article.description, DESCRIPTION_LIMIT)}
          </p>
        )}
        <a
          className="citizen-news-card-link"
          href={article.url}
          target="_blank"
          rel="noopener noreferrer"
        >
          {t.readMore} →
        </a>
      </div>
    </article>
  );
}