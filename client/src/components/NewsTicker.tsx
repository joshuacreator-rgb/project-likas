/**
 * Scrolling breaking-news ticker for the citizen dashboard (client change,
 * §24). The headlines come from the same NewsAPI-backed query the news feed
 * uses, so the page fetches once and shares the result. The ticker hides
 * itself entirely when there is nothing to show; the section is paused on
 * hover and frozen under reduced-motion so it never becomes a distraction.
 */

import { newsCopy } from "../../../shared/news";
import type { CitizenLanguage } from "../../../shared/citizen";

export function NewsTicker({
  headlines,
  language,
}: {
  headlines: readonly string[];
  language: CitizenLanguage;
}) {
  const t = newsCopy[language];
  if (headlines.length === 0) return null;

  // The track is duplicated so the CSS loop can translate -50% seamlessly.
  const doubled = [...headlines, ...headlines];

  return (
    <div className="citizen-news-ticker" role="region" aria-label={t.tickerLabel}>
      <div className="citizen-news-ticker-track">
        {doubled.map((headline, index) => (
          <span
            key={index}
            className="citizen-news-ticker-item"
            aria-hidden={index >= headlines.length}
          >
            <span className="citizen-news-ticker-breaking">{t.breakingPrefix}</span>
            {headline}
          </span>
        ))}
      </div>
    </div>
  );
}