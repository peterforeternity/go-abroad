# Public study-data sources

Staging uses `DATA_PROVIDER_MODE=public-apis`. This mode does not require a business API key and never falls back to the development demo dataset.

| Source | Data used | Authority and limitations |
| --- | --- | --- |
| OpenAlex | Institution names, country, homepage, works and citation counts | Open scholarly graph. Counts are not university rankings, admission odds, or teaching-quality assessments. |
| GOV.UK Search API | UK government pages related to international students and student visas | Links back to GOV.UK. Applicants must verify dates and complete conditions on the source page. |
| FederalRegister.gov API | US regulatory notices related to international students and visas | Search aid for Federal Register material. Legal reliance should use the linked official govinfo.gov edition. |

Each API response includes `meta.source`, `meta.sources`, `lastSyncedAt`, `isStale`, `isDemo=false`, and `dataVersion`. Each policy or institution item includes a source label and URL. If every source fails, the API returns an upstream error. If only some sources fail, successful records remain visible and the payload is marked stale/degraded; the sync job does not record a partial result as a successful full sync.

The `major` and `scholarship` filters intentionally return no records until a trustworthy provider is integrated. No public API result is described as a comprehensive ranking or authoritative application decision.
