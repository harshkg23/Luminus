// ============================================================================
// TollGate — WebSocket Server (Socket.io)
//
// Manages real-time event broadcasting during pipeline execution.
// Clients join session-specific rooms to receive targeted events.
//
// Usage (server-side):
//   import { emitSessionEvent } from "@/lib/websocket/server";
//   emitSessionEvent(sessionId, "test.progress", payload);
//
// Since Next.js App Router doesn't natively attach Socket.io,
// we use a singleton pattern. The server is initialised lazily
// on the first API call that needs it, and attaches to the
// underlying Node HTTP server via a global reference.
// ============================================================================

import { Server as SocketIOServer } from "socket.io";
import type { Server as HTTPServer } from "http";
import type { WSEventName, WSEventPayload } from "./events";

// ── Global reference (survives HMR in dev) ──────────────────────────────────

type GlobalWithIO = typeof globalThis & {
  __tollgate_io?: SocketIOServer;
  __tollgate_http?: HTTPServer;
};

const g = globalThis as GlobalWithIO;

// ── Initialise ──────────────────────────────────────────────────────────────

/**
 * Get (or create) the Socket.io server instance.
 * Must be called with the Node HTTP server on first use.
 */
export function getIO(httpServer?: HTTPServer): SocketIOServer | null {
  if (g.__tollgate_io) return g.__tollgate_io;

  const server = httpServer ?? g.__tollgate_http;
  if (!server) {
    // No HTTP server available yet — queue events will be no-ops
    return null;
  }

  g.__tollgate_http = server;
  g.__tollgate_io = new SocketIOServer(server, {
    path: "/api/ws",
    cors: { origin: "*", methods: ["GET", "POST"] },
    transports: ["websocket", "polling"],
  });

  g.__tollgate_io.on("connection", (socket) => {
    console.log(`[WS] Client connected: ${socket.id}`);

    // Clients join a session room: { session_id: "xxx" }
    socket.on("join_session", (data: { session_id: string }) => {
      if (data.session_id) {
        const room = `session:${data.session_id}`;
        socket.join(room);
        console.log(`[WS] ${socket.id} joined ${room}`);
      }
    });

    socket.on("leave_session", (data: { session_id: string }) => {
      if (data.session_id) {
        socket.leave(`session:${data.session_id}`);
      }
    });

    socket.on("disconnect", () => {
      console.log(`[WS] Client disconnected: ${socket.id}`);
    });
  });

  console.log("[WS] Socket.io server initialised on /api/ws");
  return g.__tollgate_io;
}

// ── Event Emitter ───────────────────────────────────────────────────────────

/**
 * Broadcast an event to all clients listening to a specific session.
 * Safe to call even when no clients are connected (no-op).
 */
export function emitSessionEvent(
  sessionId: string,
  event: WSEventName,
  payload: WSEventPayload
): void {
  const io = getIO();
  if (!io) return; // No WS server yet — silently skip
  io.to(`session:${sessionId}`).emit(event, payload);
}

/**
 * Broadcast an event to ALL connected clients (global announcements).
 */
export function emitGlobalEvent(
  event: WSEventName,
  payload: WSEventPayload
): void {
  const io = getIO();
  if (!io) return;
  io.emit(event, payload);
}
