---
title: Migrate from raw EventSource
description: Replace a hand-rolled EventSource integration with useStellarEvent or useContractEvent.
---

If your app already has a working `new EventSource(...)` call against a Stellar-events backend — your own or someone else's — this guide shows what `@orbital-stellar/pulse-notify` replaces and why.

## What raw `EventSource` leaves on you

A minimal hand-rolled integration looks like this:

```tsx
"use client";
import { useEffect, useRef, useState } from "react";

function useRawStellarEvents(serverUrl: string, address: string) {
  const [event, setEvent] = useState<unknown>(null);
  const [connected, setConnected] = useState(false);
  const sourceRef = useRef<EventSource | null>(null);

  useEffect(() => {
    const source = new EventSource(`${serverUrl}/events/${address}`);
    sourceRef.current = source;

    source.onopen = () => setConnected(true);
    source.onerror = () => setConnected(false);
    source.onmessage = (message) => {
      try {
        setEvent(JSON.parse(message.data));
      } catch {
        // malformed payload — drop it
      }
    };

    return () => {
      source.close();
      sourceRef.current = null;
    };
  }, [serverUrl, address]);

  return { event, connected };
}
```

This works, but every app that writes it re-solves the same problems:

- **No connection pooling.** Two components watching the same address open two separate `EventSource` connections instead of sharing one.
- **No type narrowing.** `event` is `unknown` — every consumer re-implements its own parsing and type guards.
- **No event-type filtering.** You get every event on the address and filter client-side, or you write a second hook per event type.
- **No `Last-Event-ID` handling.** A reconnect after a network blip silently misses whatever happened while the tab was disconnected.
- **No auth story.** Token refresh, `withCredentials`, and auth-expiry all need to be wired by hand.
- **Manual cleanup.** Forgetting to `close()` on unmount leaks a connection per mount.

## The replacement: `useStellarEvent`

```tsx
"use client";
import { useStellarEvent } from "@orbital-stellar/pulse-notify";

function IncomingPayments({ address }: { address: string }) {
  const { event, connected, error } = useStellarEvent(
    "https://events.example.com",
    address,
    { event: "payment.received" },
  );

  if (!connected) return <p>Connecting…</p>;
  if (error) return <p>Error: {error}</p>;
  if (!event) return <p>No payments yet.</p>;
  return <p>+{event.amount} {event.asset} from {event.from.slice(0, 8)}…</p>;
}
```

What you get instead of the hand-rolled version above:

- **Connection pooling** — every hook instance with the same `serverUrl` + `address` + `token` shares one `EventSource`.
- **Typed events** — `event` is a `NormalizedEvent` variant; pass a narrower union as the generic (see [Real-time Events → Type narrowing](/docs/guides/real-time-events#type-narrowing)) for exhaustive `switch` handling with no casts.
- **Event-type filtering** — pass `event: "payment.received"`, an array of types, or `"*"` for everything, without writing a second hook.
- **Last-Event-ID tracking** — the connection pool forwards the SSE `id:` field so a reconnecting backend (backed by `pulse-core`'s cursor persistence — see [Cursor Persistence](/docs/guides/cursor-persistence)) can resume without gaps.
- **Auth handling** — pass `token` and the hook forwards it as a query param; `onAuthExpired` is available for token-refresh flows.
- **Automatic cleanup** — the hook unsubscribes and closes the pooled connection when the last consumer unmounts.

## Migrating a Soroban contract-event integration

If your raw integration points at a `/contract_events/:contractId` endpoint instead, the same trade replaces it with `useContractEvent` — the contract-event counterpart to `useStellarEvent`, backed by [Soroban event subscription](/docs/guides/soroban-subscription) on the server side:

```tsx
"use client";
import { useContractEvent } from "@orbital-stellar/pulse-notify";

function ContractActivity({ contractId }: { contractId: string }) {
  const { event, connected } = useContractEvent({
    serverUrl: "https://events.example.com",
    contractId,
    topics: ["transfer"],
  });

  if (!connected || !event) return <p>Waiting for events…</p>;
  return <p>{event.type}: {JSON.stringify(event.decodedData ?? event.raw)}</p>;
}
```

## Migration steps

1. Stand up (or confirm you already have) a backend SSE endpoint powered by `@orbital-stellar/pulse-core` — see [Real-time Events → Standing up an SSE endpoint](/docs/guides/real-time-events#standing-up-an-sse-endpoint) if you need one.
2. Replace each `new EventSource(...)` call site with `useStellarEvent` (classic operations) or `useContractEvent` (Soroban contract events).
3. Delete the manual `onopen`/`onmessage`/`onerror` wiring, the `useRef` cleanup, and any hand-rolled reconnect logic — the hook owns all of it.
4. If you were parsing raw JSON into your own shape, switch to the typed `NormalizedEvent` fields directly, or narrow with a generic as shown above.
5. If multiple components in your tree watch the same address, verify they now share one connection — check `connected` toggles together across instances, or inspect the pool via [`pulse-notify`'s DevTools panel](/docs/api/pulse-notify) in development.

## What doesn't change

Your backend SSE contract stays the same shape (`data: <json>\n\n` per message, optional `id: <cursor>`) — `pulse-notify` is a client-side replacement, not a protocol change. If your existing endpoint already emits that shape, no backend changes are required at all.
