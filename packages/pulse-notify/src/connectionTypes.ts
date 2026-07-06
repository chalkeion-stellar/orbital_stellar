// connectionTypes.ts
// Shared connection-key/subscriber shapes used by both the SSE pool
// (connectionPool.ts) and the WebSocket pool (wsTransport.ts).

import type { NormalizedEvent } from "@orbital-stellar/pulse-core";

export type ConnectionKey = {
  serverUrl: string;
  address: string;
  token?: string;
  withCredentials?: boolean;
};

export type ConnectionSubscriber = {
  onOpen: () => void;
  onEvent: (event: NormalizedEvent) => void;
  onParseError: () => void;
  onError: () => void;
  onAuthExpired?: () => void;
  /** Called with the SSE `id:` field value when non-empty; enables Last-Event-ID catch-up tracking. */
  onEventId?: (id: string) => void;
};

/** wsTransport has no notion of `withCredentials` (WebSocket auth differs from EventSource). */
export type WsConnectionKey = Omit<ConnectionKey, "withCredentials">;

/** wsTransport does not support Last-Event-ID catch-up. */
export type WsConnectionSubscriber = Omit<ConnectionSubscriber, "onEventId">;
