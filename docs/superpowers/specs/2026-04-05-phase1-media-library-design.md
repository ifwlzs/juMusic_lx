# Phase 1 Media Library Design

Date: 2026-04-05
Status: Approved for implementation planning

## Summary

Phase 1 adds a unified personal music library for `Local Folder`, `WebDAV`, and `SMB` sources. The app will scan selected folders into a local index, let users browse the library either as a unified deduplicated collection or by source, play tracks through an on-demand caching flow, and record basic playback analytics.

This phase intentionally does not implement `OneDrive`, `Emby`, `Navidrome`, user-profile sync, or lyric timing calibration. Those capabilities must be supported by the architecture, but they are not part of the initial delivery scope.

## Goals

1. Support `Local Folder`, `WebDAV`, and `SMB` as first-class library sources.
2. Allow users to select folders, scan audio files recursively, and build a persistent library index.
3. Play indexed audio files with a cache-first playback resolver for remote sources.
4. Invalidate cached media immediately when the remote file version changes.
5. Record playback count, playback duration, and minimum necessary song information for later analytics or recommendation features.
6. Extend the global search experience so personal-library sources appear as independent source tabs and rank ahead of online sources in aggregated search.

## Non-Goals

1. Background auto-refresh, scheduled scans, or startup auto-scan.
2. Full offline download management beyond playback-triggered caching.
3. `OneDrive`, `Emby`, or `Navidrome` provider implementation.
4. User-profile sync across local and remote.
5. Lyric timing calibration, per-song lyric offset, or global lyric offset UI.
6. Recommendation features, reports, or advanced playback analytics visualization.

## Current Project Audit

### Reusable existing capabilities

1. Local import and metadata reading already exist and can be refactored into the new provider/index flow.
2. Local playback already exists.
3. Local lyric reading already exists, including MP3 embedded lyric support through the current metadata dependency path.
4. Player-level URL caching and next-track warm-up already exist and can be reused as part of the playback pipeline.
5. A sync framework already exists, but it currently covers other data domains and should not be repurposed for Phase 1 media indexing.

### Existing gaps

1. Local directory scan is not recursive today.
2. `WebDAV`, `SMB`, `OneDrive`, `Emby`, and `Navidrome` source integration are not implemented in the current app.
3. There is no business-layer cache version management that can invalidate stale remote media immediately.
4. Playback analytics are not implemented.
5. Global search is built around online providers and needs a source registry that can also expose indexed personal-library sources.

## Product Rules Confirmed For Phase 1

1. Refresh behavior is manual only. The user must explicitly trigger scan or refresh.
2. Default library mode is a unified library with deduplication, but a source-specific browsing mode must also exist.
3. Unified-library deduplication uses a conservative rule: `title + artist + duration tolerance`.
4. Remote playback is not direct-stream-first. The app should build the library from scans, then fetch and cache media when the user plays a track.
5. When the remote version changes, the existing cache must be deleted immediately.
6. Search must expose `Local`, `WebDAV`, and `SMB` as independent source tabs.
7. In aggregated search, personal-library sources rank ahead of current online sources.
8. Lyric timing calibration is deferred to Phase 2.

## Architecture

Phase 1 should add a dedicated media-library domain rather than mixing new behavior into unrelated online-source logic. The domain should consist of the following modules.

### 1. Source Provider

Each provider implements one interface for a concrete source type:

1. `Local Folder`
2. `WebDAV`
3. `SMB`

Each provider is responsible for:

1. Validating a connection or folder root.
2. Enumerating directories and files under the selected root.
3. Returning basic file metadata required for indexing.
4. Returning a stable item identity and a version token.
5. Resolving a playable resource for the selected item.

Providers do not own deduplication, cache policy, analytics, or UI rules.

### 2. Library Index

The library index is the business-layer source of truth. It persists scan results, aggregate-library views, cache records, and playback analytics. It separates source-file identity from UI-friendly library aggregation.

### 3. Playback Resolver

The playback resolver sits between the library index and the existing player. It decides whether playback should use:

1. A directly readable local file.
2. A valid cached file.
3. A newly fetched remote file that is then cached.

The resolver must own cache validity checks before handing a resource to the current player layer.

### 4. Cache Manager

The cache manager persists cache metadata, maps cache files to source items, validates version tokens, and deletes stale cache immediately when a source item changes version.

### 5. Play Analytics

The analytics module records:

1. Play count when playback exceeds one third of the track duration.
2. Total listened duration.
3. Minimum necessary track identity references for later aggregate reporting or recommendation features.

### 6. Search Source Registry

Search should no longer assume that every source is an online API provider. A new registry layer must expose both:

1. Online search providers.
2. Indexed library providers backed by local data queries.

This keeps the search UI stable while allowing new source types to join later.

## Data Model

Phase 1 should not use a single flat songs table. It needs separate records for connection, source file instance, aggregate song, cache entry, and analytics.

### `source_connection`

Represents one configured source root, for example:

1. A selected local folder.
2. A configured `WebDAV` root.
3. A configured `SMB` share path.

Suggested fields:

1. `connection_id`
2. `provider_type`
3. `display_name`
4. `root_path_or_uri`
5. `credential_ref`
6. `last_scan_at`
7. `last_scan_status`
8. `last_scan_summary`

Sensitive credentials should not be stored in plain fields inside the index. The index stores references only.

### `source_item`

Represents one real file instance discovered from one source.

Suggested fields:

1. `source_item_id`
2. `connection_id`
3. `provider_type`
4. `source_unique_key`
5. `path_or_uri`
6. `file_name`
7. `title`
8. `artist`
9. `album`
10. `duration_sec`
11. `mime_type`
12. `file_size`
13. `version_token`
14. `last_seen_at`
15. `scan_status`
16. `aggregate_song_id`

`version_token` is the key field for cache invalidation.

Recommended version-token sources:

1. `Local Folder`: path plus file size plus modified time.
2. `WebDAV`: `etag` first, then modified time plus file size.
3. `SMB`: server modified time plus file size, with a provider-specific file identifier when available.

### `aggregate_song`

Represents a deduplicated entry in the unified library. Multiple `source_item` rows may link to one `aggregate_song`.

Suggested fields:

1. `aggregate_song_id`
2. `canonical_title`
3. `canonical_artist`
4. `canonical_album`
5. `canonical_duration_sec`
6. `preferred_source_item_id`
7. `source_count`
8. `created_at`
9. `updated_at`

Deduplication rule for Phase 1:

1. Match by normalized title.
2. Match by normalized artist.
3. Match by duration within a narrow tolerance, recommended at `+/-2 seconds`.

If matching is uncertain, keep separate rows. False merge is worse than duplicate display.

### `media_cache`

Represents cached playable media created by on-demand playback.

Suggested fields:

1. `cache_id`
2. `source_item_id`
3. `version_token`
4. `local_file_path`
5. `cached_file_size`
6. `cache_status`
7. `created_at`
8. `last_access_at`

Cache is attached to `source_item`, not to `aggregate_song`. Cache validity is always determined by the concrete source file version.

### `play_stats`

Stores analytics per aggregate song, with a reference to the actual source item used most recently.

Suggested fields:

1. `aggregate_song_id`
2. `last_source_item_id`
3. `play_count`
4. `play_duration_total_sec`
5. `last_played_at`

## Scan And Index Flow

### Manual scan entry

Users explicitly trigger scan or refresh for a configured connection. Phase 1 does not run background or scheduled scans.

### Scan pipeline

1. Validate the source connection or local root.
2. Enumerate files recursively.
3. Filter supported audio files.
4. Read minimum required metadata.
5. Build or update `source_item`.
6. Match the item into an `aggregate_song` using the conservative deduplication rule.
7. Persist scan results and scan summary.

### Incremental update behavior

During a rescan, when an already-known `source_item` is found again:

1. Compare the new `version_token` with the stored token.
2. If unchanged, update bookkeeping such as `last_seen_at`.
3. If changed:
   1. Delete the old cached file immediately.
   2. Delete the corresponding `media_cache` row.
   3. Update the `source_item` metadata and `version_token`.
   4. Recompute aggregate-song fields if metadata changed.

If a remote refresh fails, existing indexed content should remain available. One failed refresh must not erase the library.

## Playback Resolution And Cache Policy

Phase 1 playback is not designed as raw remote streaming. It uses indexed content plus playback-triggered caching.

### Playback priority

When the user requests playback from the unified library, choose the resource in this order:

1. A directly readable local file from `Local Folder`.
2. A valid cached file for the selected `WebDAV` or `SMB` source item.
3. A remote `WebDAV` or `SMB` source item fetched on demand and then written into cache.

### Cache creation

1. Cache is created when a user actually plays a remote track.
2. Full-library predownload is out of scope.
3. Existing next-track warm-up can be retained as an optimization, but it must not change the business rules.

### Cache validity

1. Every cache record stores the `version_token` that was current when the cache was created.
2. Playback must validate cache metadata before use.
3. If the current source-item token no longer matches the cached token, the cache is stale.

### Cache invalidation

If a scan or playback-time validation detects that the remote version changed:

1. Delete the cache file immediately.
2. Remove or mark invalid the `media_cache` record immediately.
3. Do not allow playback to continue using the stale file.
4. Fetch the new version before playback can continue for that source item.

This business rule cannot rely on the player-internal cache alone. Phase 1 needs its own cache index and invalidation policy.

## Library Browsing

Phase 1 exposes two library views:

1. Unified library view.
2. Source-specific view.

### Unified library view

1. Default entry point for personal-library browsing.
2. Shows deduplicated `aggregate_song` rows.
3. Displays source markers or counts so the user can still understand where a song comes from.

### Source-specific view

1. Shows `source_item` rows for a chosen source connection or provider type.
2. Does not apply aggregate deduplication rules.
3. Is useful when the user wants to inspect one source independently.

## Search Design

The global search page must be extended, not replaced.

### Search sources

Add these source tabs as independent search sources:

1. `Local`
2. `WebDAV`
3. `SMB`

Later sources such as `OneDrive` should fit the same pattern.

### Search behavior

1. Personal-library source search queries the local library index only.
2. Search does not trigger remote rescan.
3. If a user has not scanned a source, that source has no searchable content yet.
4. Source tabs remain independent. Local-folder results are not mixed into the `WebDAV` tab, and so on.

### Aggregated search order

When the search view shows aggregated results, priority order is:

1. `Local`
2. `WebDAV`
3. `SMB`
4. Existing online sources

This keeps personal-library results above online results by default.

### Search implementation boundary

The search UI should depend on the new search source registry rather than directly assuming online `musicSdk` providers. Online sources and indexed-library sources both expose a search interface, but the underlying implementation differs.

## Playback Analytics

Phase 1 analytics exist to establish a trustworthy foundation for later features, not to deliver reporting UI.

### Recorded data

1. Aggregate song identity reference.
2. Last source-item reference.
3. Play count.
4. Total listened duration.
5. Last played timestamp.

### Counting rule

1. During one playback session, once accumulated listened time reaches at least one third of the track duration, increment `play_count` once.
2. The same session must not increment `play_count` more than once.
3. `play_duration_total_sec` accumulates actual listened time.
4. Seeking must not grant an extra play count by itself.
5. State changes such as stop, track change, app backgrounding, or playback end must flush session progress safely.

## Error Handling

### Scan failures

1. A single-file failure must not abort the entire scan.
2. Scan results should distinguish success, skipped, and failed items.
3. The connection should store a summary of the last scan result.

### Source refresh failures

1. If `WebDAV` or `SMB` refresh fails, keep the existing indexed content.
2. Mark the refresh attempt as failed instead of clearing the source.

### Playback failures

1. If a local file is missing, try to resolve another valid source item for the aggregate song when possible.
2. If cache is corrupt or missing, retry through the normal fetch path.
3. If remote fetch still fails, surface a user-visible playback error.

### Cache deletion failures

1. If immediate cache deletion fails, mark the cache entry invalid at once.
2. Invalid cache must never be selected for playback.
3. Background cleanup can remove the orphaned file later.

## Delivery Phases Inside Phase 1

Implementation should be staged internally in this order:

### Stage 1: Foundation

1. Source-provider abstraction.
2. Library-index storage and repositories.
3. New data model migration.
4. Local-folder provider migration onto the new abstraction.

### Stage 2: Library ingestion

1. Recursive scan for local folders.
2. `WebDAV` provider implementation.
3. `SMB` provider implementation.
4. Manual scan and manual refresh flows.
5. Unified and source-specific browse views.

### Stage 3: Playback and cache

1. Playback resolver.
2. Cache manager.
3. Immediate stale-cache invalidation.
4. Integration with the existing player.

### Stage 4: Search and analytics

1. Search source registry.
2. `Local`, `WebDAV`, and `SMB` source tabs.
3. Aggregated search ranking changes.
4. Playback analytics persistence and event wiring.

## Phase 2 Reservations

The following must remain out of Phase 1 scope but should be enabled by the design:

1. `OneDrive` provider.
2. `Emby` provider or bridge.
3. `Navidrome` provider or bridge.
4. User-profile sync between local and remote.
5. Lyric timing calibration, offset persistence, and offset UI.

## Verification Strategy

### Unit tests

1. Deduplication rule using normalized title, artist, and duration tolerance.
2. Version-token comparison and update detection.
3. Cache invalidation when the source version changes.
4. Play-count threshold logic and single-session counting guard.

### Integration tests

1. Recursive local-folder scan.
2. `WebDAV` scan into the index.
3. `SMB` scan into the index.
4. Remote playback with cache creation.
5. Repeated playback with cache hit.
6. Remote version change followed by immediate cache invalidation.

### Manual acceptance tests

1. Same song from multiple sources appears once in unified view when it matches the conservative deduplication rule.
2. Per-source view still shows the original source instances independently.
3. Cached media remains playable when the source is temporarily unavailable.
4. Failed refresh does not wipe a source from the library.
5. Aggregated search surfaces personal-library results ahead of online sources.

## Implementation Recommendation

Use one unified media-library domain for `Local Folder`, `WebDAV`, and `SMB`, with provider-specific adapters and a shared index. Do not bolt remote-file logic directly into current online music-source code paths, and do not depend solely on player-internal cache for business correctness.
