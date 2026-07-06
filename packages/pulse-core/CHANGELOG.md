# pulse-core Changelog

## [0.1.0] — 2026-05-28

### Breaking Changes
- **WatcherNotification API**: The `timestamp` field on `WatcherNotification` (`engine.reconnecting` and `engine.reconnected` events) has been renamed to `emittedAt` to distinguish it from the on-chain `created_at` timestamp used in other events like `payment.received`.

See the root [`CHANGELOG.md`](../../CHANGELOG.md) for the full `v0.1.0` release notes across all packages.
