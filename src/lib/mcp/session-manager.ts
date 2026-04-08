// ============================================================================
// TollGate — Session Manager (MongoDB-Backed)
//
// Persistent session tracking for test execution runs. Manages the lifecycle
// of test sessions — creation, status updates, result storage, and retrieval.
// Uses MongoDB so sessions survive server restarts.
// ============================================================================

import { Collection, Db } from "mongodb";
import clientPromise from "@/lib/mongodb-client";
import { TestSession, TestPlanInput, TestRunOutput, SessionStatus } from "./types";

// ── Extended session fields for agent integration ───────────────────────────

export interface PersistedSession extends TestSession {
  /** Per-agent status tracking */
  agents?: Record<string, { status: string; updated_at: string }>;
  /** LangGraph checkpoint data (for Aaskar's AI engine) */
  checkpoint_data?: unknown;
  /** Courier result (PR or Issue URL) */
  courier_result?: { type: "pr" | "issue"; url?: string; number?: number };
  /** BSON Date copy of created_at used by the MongoDB TTL index */
  created_at_date?: Date;
}

// ── Session Manager ─────────────────────────────────────────────────────────

export class SessionManager {
  private collectionPromise: Promise<Collection<PersistedSession>> | null = null;

  private async getCollection(): Promise<Collection<PersistedSession>> {
    if (!this.collectionPromise) {
      this.collectionPromise = clientPromise.then(async (client) => {
        const db: Db = client.db();
        const col = db.collection<PersistedSession>("sessions");

        // Ensure indexes exist (idempotent)
        await col.createIndex({ id: 1 }, { unique: true });
        await col.createIndex({ status: 1 });
        // TTL index must use a BSON Date field — ISO strings are not evaluated
        await col.createIndex(
          { created_at_date: 1 },
          { expireAfterSeconds: 7 * 24 * 60 * 60 } // TTL: 7 days
        );

        return col;
      });
    }
    return this.collectionPromise;
  }

  /**
   * Create a new test session from a test plan input.
   */
  async createSession(input: TestPlanInput): Promise<PersistedSession> {
    const col = await this.getCollection();
    const now = new Date();
    const session: PersistedSession = {
      id: input.session_id,
      status: "pending",
      input,
      created_at: now.toISOString(),
      created_at_date: now,
    };

    // Upsert so retries on partial failures are idempotent
    const result = await col.findOneAndUpdate(
      { id: input.session_id },
      { $setOnInsert: session },
      { upsert: true, returnDocument: "after", projection: { _id: 0 } }
    );
    const persisted = result ?? session;
    console.log(`[Session Manager] Created session ${persisted.id}`);
    return persisted;
  }

  /**
   * Get a session by ID.
   */
  async getSession(id: string): Promise<PersistedSession | null> {
    const col = await this.getCollection();
    return col.findOne({ id }, { projection: { _id: 0 } });
  }

  /**
   * Update a session's status.
   */
  async updateStatus(id: string, status: SessionStatus, error?: string): Promise<void> {
    const col = await this.getCollection();
    const update: Record<string, unknown> = { status };
    if (error) update.error = error;
    if (status === "completed" || status === "failed") {
      update.completed_at = new Date().toISOString();
    }
    await col.updateOne({ id }, { $set: update });
  }

  /**
   * Attach test run output to a session.
   */
  async setOutput(id: string, output: TestRunOutput): Promise<void> {
    const col = await this.getCollection();
    await col.updateOne(
      { id },
      {
        $set: {
          output,
          status: output.failed > 0 ? "failed" : "completed",
          completed_at: new Date().toISOString(),
        },
      }
    );
  }

  /**
   * Update per-agent status within a session.
   */
  async updateAgentStatus(
    sessionId: string,
    agentName: string,
    status: string
  ): Promise<void> {
    const col = await this.getCollection();
    await col.updateOne(
      { id: sessionId },
      {
        $set: {
          [`agents.${agentName}`]: {
            status,
            updated_at: new Date().toISOString(),
          },
        },
      }
    );
  }

  /**
   * Store Courier result on a session.
   */
  async setCourierResult(
    sessionId: string,
    result: { type: "pr" | "issue"; url?: string; number?: number }
  ): Promise<void> {
    const col = await this.getCollection();
    await col.updateOne({ id: sessionId }, { $set: { courier_result: result } });
  }

  /**
   * Store LangGraph checkpoint data.
   */
  async setCheckpoint(sessionId: string, data: unknown): Promise<void> {
    const col = await this.getCollection();
    await col.updateOne({ id: sessionId }, { $set: { checkpoint_data: data } });
  }

  /**
   * List all sessions, optionally filtered by status.
   */
  async listSessions(statusFilter?: SessionStatus): Promise<PersistedSession[]> {
    const col = await this.getCollection();
    const filter = statusFilter ? { status: statusFilter } : {};
    return col
      .find(filter, { projection: { _id: 0 } })
      .sort({ created_at: -1 })
      .limit(50)
      .toArray();
  }

  /**
   * Delete a session by ID.
   */
  async deleteSession(id: string): Promise<boolean> {
    const col = await this.getCollection();
    const result = await col.deleteOne({ id });
    return result.deletedCount > 0;
  }

  /**
   * Clear all sessions (useful for testing).
   */
  async clearAll(): Promise<void> {
    const col = await this.getCollection();
    await col.deleteMany({});
  }
}

// ── Singleton Instance ──────────────────────────────────────────────────────

export const sessionManager = new SessionManager();
