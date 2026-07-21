# Curated official-source crawler

The crawler is deliberately bounded for Cloudflare Workers. It is not a general-purpose spider and never follows links discovered in page content.

## Sources

- Canada.ca designated learning institutions
- Study in Japan school and programme search
- Study in Japan scholarship and tuition-reduction search
- Australian Department of Education financial assistance for international students
- Canada.ca study permits and scholarships
- Singapore ICA Student's Pass guidance
- MIT official graduate admission facts
- Stanford Graduate Admissions
- Harvard University admissions and aid
- UC Berkeley Graduate Division admissions
- Princeton University undergraduate admission
- Yale University admissions

Every seed is an HTTPS URL in a code-reviewed hostname allowlist. Results retain the official URL, source label, extraction time, and a content hash. Extracted content is presented as a summary and the UI links to the original page.

## Safety and politeness

- `robots.txt` is checked before each page fetch. A robots network failure fails closed for that host.
- Redirects are handled manually and may only remain on allowlisted HTTPS hosts.
- No cookies, browser sessions, Authorization headers, API keys, proxies, fingerprint spoofing, CAPTCHA solving, or access-control bypasses are used.
- Pages are limited to 1 MiB in staging and must be HTML/XHTML.
- Fetches use a five-second timeout and at most one retry.
- Cron runs every five minutes, but `CRAWLER_INTERVAL_SECONDS=21600` limits page refresh to once every six hours.
- The seed count is capped by `CRAWLER_MAX_PAGES`; staging uses sixteen or fewer pages.
- Fetch failures keep the last successful extract for up to seven days. A robots denial removes that source from the retained set.

## Storage and request path

Crawler output is stored in the staging KV namespace under `study-crawler:curated:v2`. The version was advanced when the reviewed U.S. university sources were added so the next scheduled run creates a fresh snapshot. The HTTP API only reads this snapshot. Network crawling happens through the scheduled synchronization path, so a user request never initiates a crawl.

The normal study-data snapshot remains cached separately. Crawler errors are recorded only as source IDs and public error codes; response bodies, full HTML, cookies, request headers, IP addresses, and secrets are not logged.

## Configuration

| Variable | Staging value | Meaning |
| --- | ---: | --- |
| `CRAWLER_ENABLED` | `true` | Enables refresh from the scheduled sync path. |
| `CRAWLER_INTERVAL_SECONDS` | `21600` | Minimum interval between crawl attempts. |
| `CRAWLER_MAX_PAGES` | `16` | Hard cap on curated pages per run. |
| `CRAWLER_MAX_BYTES` | `1048576` | Maximum response bytes per page. |

Changing the allowlist requires code review and a new deployment. Arbitrary user-supplied crawl URLs are intentionally unsupported.

## Ranking data boundary

The crawler does not scrape or reproduce QS World University Rankings or U.S. News ranking tables. Those are third-party editorial datasets, not university-owned admissions data. In particular, QS requires express written permission for automated crawling and commercial reuse. A university's presence in this curated list does not represent a rank, score, endorsement, or completeness claim.

The current open substitutes are OpenAlex, whose research-output counts are explicitly labelled as non-ranking statistics, and the U.S. Department of Education College Scorecard API for official institution, cost, admissions, and program facts. College Scorecard requires a separately issued `api.data.gov` key stored only as the Cloudflare Secret `COLLEGE_SCORECARD_API_KEY`. If licensed QS data is later purchased, it must enter through a contracted provider/API and preserve the ranking edition, methodology, attribution, license scope, and source URL; it must never be populated by this crawler.

## Open-source crawler evaluation

The following maintained open-source projects were reviewed before keeping the Worker-native implementation:

- [Crawlee](https://github.com/apify/crawlee) is Apache-2.0 and provides queues, browser automation, proxy rotation, and fingerprinting for Node.js. Its runtime and storage model are not a direct fit for a small Cloudflare Worker, and its anti-blocking features conflict with this crawler's intentionally transparent request policy.
- [Firecrawl](https://github.com/mendableai/firecrawl) is AGPL-3.0. Self-hosting requires a separate multi-service deployment (including browser and queue/storage infrastructure); its hosted API would introduce another external credential and processor.
- [Mercury Parser](https://github.com/thoraxe/mercury-parser) is Apache-2.0 and focused on article extraction, but does not replace scheduling, robots enforcement, hostname controls, KV persistence, or Worker-specific limits.

The current implementation therefore remains dependency-light and Worker-native. These projects may be reconsidered if JavaScript-rendered sites become an approved requirement and a separate crawler service is deployed with its own security and license review.
