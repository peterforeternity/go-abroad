# Curated official-source crawler

The crawler is deliberately bounded for Cloudflare Workers. It is not a general-purpose spider and never follows links discovered in page content.

## Sources

- Canada.ca designated learning institutions
- Study in Japan school and programme search
- Study in Japan scholarship and tuition-reduction search
- Australian Department of Education financial assistance for international students
- Canada.ca study permits and scholarships
- Singapore ICA Student's Pass guidance

Every seed is an HTTPS URL in a code-reviewed hostname allowlist. Results retain the official URL, source label, extraction time, and a content hash. Extracted content is presented as a summary and the UI links to the original page.

## Safety and politeness

- `robots.txt` is checked before each page fetch. A robots network failure fails closed for that host.
- Redirects are handled manually and may only remain on allowlisted HTTPS hosts.
- No cookies, browser sessions, Authorization headers, API keys, proxies, fingerprint spoofing, CAPTCHA solving, or access-control bypasses are used.
- Pages are limited to 1 MiB in staging and must be HTML/XHTML.
- Fetches use a five-second timeout and at most one retry.
- Cron runs every five minutes, but `CRAWLER_INTERVAL_SECONDS=21600` limits page refresh to once every six hours.
- The seed count is capped by `CRAWLER_MAX_PAGES`; staging uses eight or fewer pages.
- Fetch failures keep the last successful extract for up to seven days. A robots denial removes that source from the retained set.

## Storage and request path

Crawler output is stored in the staging KV namespace under `study-crawler:curated:v1`. The HTTP API only reads this snapshot. Network crawling happens through the scheduled synchronization path, so a user request never initiates a crawl.

The normal study-data snapshot remains cached separately. Crawler errors are recorded only as source IDs and public error codes; response bodies, full HTML, cookies, request headers, IP addresses, and secrets are not logged.

## Configuration

| Variable | Staging value | Meaning |
| --- | ---: | --- |
| `CRAWLER_ENABLED` | `true` | Enables refresh from the scheduled sync path. |
| `CRAWLER_INTERVAL_SECONDS` | `21600` | Minimum interval between crawl attempts. |
| `CRAWLER_MAX_PAGES` | `8` | Hard cap on curated pages per run. |
| `CRAWLER_MAX_BYTES` | `1048576` | Maximum response bytes per page. |

Changing the allowlist requires code review and a new deployment. Arbitrary user-supplied crawl URLs are intentionally unsupported.
