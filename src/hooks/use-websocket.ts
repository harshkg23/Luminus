"use client";

// ============================================================================
// TollGate — useSessionWebSocket React Hook
//
// Connects to the Socket.io server and returns a live stream of events
// for a given session. Handles auto-reconnect out of the box.
//
// Usage:
//   const { events, connected } = useSessionWebSocket(sessionId);
// ============================================================================

import { useEffect, useState, useRef, useCallback } from "react";
import { io, Socket } from "socket.io-client";
import type { WSEventName, WSEventPayload } from "@/lib/websocket/events";

export interface WSEvent {
  name: WSEventName;
  payload: WSEventPayload;
  receivedAt: string;
}

export function useSessionWebSocket(sessionId: string | null) {
  const [events, setEvents] = useState<WSEvent[]>([]);
  const [connected, setConnected] = useState(false);
  const socketRef = useRef<Socket | null>(null);

  const clearEvents = useCallback(() => setEvents([]), []);

  useEffect(() => {
    if (!sessionId) return;

    setEvents([]);

    let cancelled = false;

    const connect = async () => {
      try {
        await fetch("/api/ws", { method: "GET", cache: "no-store" });
      } catch {
        // Socket server bootstrap may fail transiently during startup.
      }

      if (cancelled) return;

      const socket = io({
        path: "/api/ws",
        transports: ["websocket", "polling"],
      });

      socketRef.current = socket;

      socket.on("connect", () => {
        setConnected(true);
        socket.emit("join_session", { session_id: sessionId });
      });

      socket.on("disconnect", () => setConnected(false));

      // Listen to all TollGate event types
      const eventNames: WSEventName[] = [
        "session.status_changed",
        "agent.started",
        "agent.completed",
        "test.progress",
        "test.failed",
        "healing.started",
        "healing.completed",
        "courier.pr_created",
        "courier.issue_created",
        "pipeline.started",
        "pipeline.completed",
      ];

      for (const name of eventNames) {
        socket.on(name, (payload: WSEventPayload) => {
          setEvents((prev) => [
            ...prev,
            { name, payload, receivedAt: new Date().toISOString() },
          ]);
        });
      }
    };

    void connect();

    return () => {
      cancelled = true;
      socketRef.current?.emit("leave_session", { session_id: sessionId });
      socketRef.current?.disconnect();
      socketRef.current = null;
    };
  }, [sessionId]);

  return { events, connected, clearEvents };
}
