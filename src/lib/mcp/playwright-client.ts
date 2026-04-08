// ============================================================================
// TollGate — Playwright MCP Client
//
// Spawns the Playwright MCP server as a child process and communicates
// via JSON-RPC 2.0 over stdio. Provides high-level methods for browser
// automation (navigate, click, type, snapshot, assert).
// ============================================================================

import { ChildProcess, spawn, type SpawnOptions } from "child_process";
import { MCPToolResponse, MCPServerConfig, DEFAULT_MCP_CONFIG } from "./types";

// ── JSON-RPC 2.0 Types ─────────────────────────────────────────────────────

interface JsonRpcRequest {
  jsonrpc: "2.0";
  id: number;
  method: string;
  params?: Record<string, unknown>;
}

interface JsonRpcResponse {
  jsonrpc: "2.0";
  id: number;
  result?: unknown;
  error?: { code: number; message: string; data?: unknown };
}

// ── PlaywrightMCPClient ─────────────────────────────────────────────────────

export class PlaywrightMCPClient {
  private process: ChildProcess | null = null;
  private requestId = 0;
  private requestTimeoutMs: number;
  private pendingRequests = new Map<
    number,
    {
      resolve: (value: JsonRpcResponse) => void;
      reject: (reason: Error) => void;
    }
  >();
  private buffer = "";
  private _isConnected = false;
  private config: MCPServerConfig;

  constructor(config: Partial<MCPServerConfig> = {}) {
    this.config = { ...DEFAULT_MCP_CONFIG, ...config };
    const defaultRequestTimeoutMs = 60000;
    const rawTimeout = process.env.PLAYWRIGHT_MCP_REQUEST_TIMEOUT_MS;
    const parsedTimeout =
      rawTimeout !== undefined ? Number.parseInt(rawTimeout, 10) : Number.NaN;
    this.requestTimeoutMs =
      Number.isFinite(parsedTimeout) && parsedTimeout > 0
        ? parsedTimeout
        : defaultRequestTimeoutMs;
  }

  // ── Lifecycle ─────────────────────────────────────────────────────────────

  /**
   * Start the Playwright MCP server as a child process.
   * Uses `npx @playwright/mcp` (version pinned or overridden via
   * PLAYWRIGHT_MCP_PACKAGE env var). Communicates over stdio using JSON-RPC 2.0.
   */
  async start(): Promise<void> {
    if (this._isConnected) {
      console.log("[MCP Client] Already connected");
      return;
    }

    const mcpPackage =
      process.env.PLAYWRIGHT_MCP_PACKAGE ?? "@playwright/mcp@0.0.68";
    console.log(`[MCP Client] Starting MCP server via npx ${mcpPackage}`);

    const npxArgs = ["-y", mcpPackage];
    if (this.config.headless) {
      npxArgs.push("--headless");
    }
    if (this.config.browserName !== "chromium") {
      npxArgs.push("--browser", this.config.browserName);
    }

    const spawnOptions: SpawnOptions = {
      stdio: ["pipe", "pipe", "pipe"],
      env: { ...process.env },
      shell: process.platform === "win32",
    };

    if (process.platform === "win32") {
      this.process = spawn("npx.cmd", npxArgs, spawnOptions);
    } else {
      this.process = spawn("npx", npxArgs, spawnOptions);
    }

    if (!this.process) {
      throw new Error("Failed to spawn Playwright MCP process");
    }

    // Handle stdout — JSON-RPC responses come here
    this.process.stdout?.on("data", (data: Buffer) => {
      this.handleStdout(data);
    });

    // Handle stderr — log server output
    this.process.stderr?.on("data", (data: Buffer) => {
      const msg = data.toString().trim();
      if (msg) {
        console.log(`[MCP Server] ${msg}`);
      }
    });

    this.process.on("error", (err) => {
      console.error("[MCP Client] Process error:", err.message);
      this._isConnected = false;
    });

    this.process.on("exit", (code) => {
      console.log(`[MCP Client] Process exited with code ${code}`);
      this._isConnected = false;
    });

    // Retry initialize until the server is ready (handles npx download time)
    await this.initializeWithRetry();
    this._isConnected = true;
    console.log("[MCP Client] Connected and initialized");
  }

  /**
   * Stop the MCP server process and its child tree.
   */
  async stop(): Promise<void> {
    if (this.process) {
      const pid = this.process.pid;
      this.process.kill("SIGTERM");
      // On Unix, also kill the process group to ensure child processes are cleaned up
      if (pid && process.platform !== "win32") {
        try {
          process.kill(-pid, "SIGTERM");
        } catch {
          // Process group may already be gone
        }
      }
      this.process = null;
      this._isConnected = false;
      console.log("[MCP Client] Stopped");
    }
  }

  get isConnected(): boolean {
    return this._isConnected;
  }

  // ── High-Level Browser Actions ────────────────────────────────────────────

  /**
   * Navigate to a URL.
   */
  async navigate(url: string): Promise<MCPToolResponse> {
    return this.callTool("browser_navigate", { url });
  }

  /**
   * Take an accessibility snapshot of the current page.
   */
  async snapshot(): Promise<MCPToolResponse> {
    return this.callTool("browser_snapshot", {});
  }

  /**
   * Click an element identified by its accessibility label/ref.
   */
  async click(element: string, ref?: string): Promise<MCPToolResponse> {
    const args: Record<string, unknown> = { element };
    if (ref) args.ref = ref;
    return this.callTool("browser_click", args);
  }

  /**
   * Type text into an element.
   */
  async type(
    element: string,
    text: string,
    ref?: string,
  ): Promise<MCPToolResponse> {
    const args: Record<string, unknown> = { element, text };
    if (ref) args.ref = ref;
    return this.callTool("browser_type", args);
  }

  /**
   * Hover over an element.
   */
  async hover(element: string, ref?: string): Promise<MCPToolResponse> {
    const args: Record<string, unknown> = { element };
    if (ref) args.ref = ref;
    return this.callTool("browser_hover", args);
  }

  /**
   * Select an option from a dropdown.
   */
  async selectOption(
    element: string,
    values: string[],
    ref?: string,
  ): Promise<MCPToolResponse> {
    const args: Record<string, unknown> = { element, values };
    if (ref) args.ref = ref;
    return this.callTool("browser_select_option", args);
  }

  /**
   * Wait for a specified duration (ms).
   */
  async wait(time: number = 2000): Promise<MCPToolResponse> {
    return this.callTool("browser_wait_for_page", { time });
  }

  /**
   * List all available tools on the MCP server.
   */
  async listTools(): Promise<string[]> {
    const response = await this.sendRequest("tools/list", {});
    const result = response.result as { tools?: Array<{ name: string }> };
    return result?.tools?.map((t) => t.name) ?? [];
  }

  // ── Low-Level MCP Communication ───────────────────────────────────────────

  /**
   * Call an MCP tool by name with arguments.
   */
  async callTool(
    toolName: string,
    toolArgs: Record<string, unknown>,
  ): Promise<MCPToolResponse> {
    try {
      const response = await this.sendRequest("tools/call", {
        name: toolName,
        arguments: toolArgs,
      });

      if (response.error) {
        return {
          success: false,
          error: response.error.message,
        };
      }

      const result = response.result as {
        content?: Array<{ type: string; text?: string }>;
        isError?: boolean;
      };

      if (result?.isError) {
        const errorText =
          result.content?.find((c) => c.type === "text")?.text ??
          "Unknown error";
        return {
          success: false,
          error: errorText,
        };
      }

      return {
        success: true,
        content: result?.content,
      };
    } catch (err) {
      return {
        success: false,
        error: err instanceof Error ? err.message : String(err),
      };
    }
  }

  // ── Private Helpers ───────────────────────────────────────────────────────

  private async sendRequest(
    method: string,
    params: Record<string, unknown>,
  ): Promise<JsonRpcResponse> {
    if (!this.process?.stdin) {
      throw new Error("MCP server is not running");
    }

    const id = ++this.requestId;
    const request: JsonRpcRequest = {
      jsonrpc: "2.0",
      id,
      method,
      params,
    };

    return new Promise<JsonRpcResponse>((resolve, reject) => {
      const timeout = setTimeout(() => {
        this.pendingRequests.delete(id);
        reject(
          new Error(
            `Request ${method} timed out after ${this.requestTimeoutMs}ms`,
          ),
        );
      }, this.requestTimeoutMs);

      this.pendingRequests.set(id, {
        resolve: (response) => {
          clearTimeout(timeout);
          resolve(response);
        },
        reject: (err) => {
          clearTimeout(timeout);
          reject(err);
        },
      });

      const message = JSON.stringify(request) + "\n";
      this.process!.stdin!.write(message);
    });
  }

  private handleStdout(data: Buffer): void {
    this.buffer += data.toString();

    // Process complete JSON-RPC messages (newline-delimited)
    const lines = this.buffer.split("\n");
    this.buffer = lines.pop() ?? "";

    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed) continue;

      try {
        const response = JSON.parse(trimmed) as JsonRpcResponse;
        if (response.id !== undefined) {
          const pending = this.pendingRequests.get(response.id);
          if (pending) {
            this.pendingRequests.delete(response.id);
            pending.resolve(response);
          }
        }
      } catch {
        // Not JSON — might be server log output
        console.log(`[MCP Server stdout] ${trimmed}`);
      }
    }
  }

  /**
   * Retry initialize until the MCP server is ready.
   * Handles slow startup when npx downloads the package for the first time.
   */
  private async initializeWithRetry(): Promise<void> {
    const maxAttempts = 15;
    const delayMs = 2000;
    const initPayload = {
      protocolVersion: "2024-11-05",
      capabilities: {},
      clientInfo: {
        name: "TollGate",
        version: "0.1.0",
      },
    };

    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      try {
        const response = await this.sendRequest("initialize", initPayload);

        if (response.error) {
          throw new Error(
            `MCP initialization failed: ${response.error.message}`,
          );
        }

        // Send initialized notification
        const notification =
          JSON.stringify({
            jsonrpc: "2.0",
            method: "notifications/initialized",
          }) + "\n";
        this.process?.stdin?.write(notification);

        console.log("[MCP Client] MCP protocol initialized");
        return;
      } catch (err) {
        if (attempt === maxAttempts) {
          throw new Error(
            `MCP server failed to initialize after ${maxAttempts} attempts: ${
              err instanceof Error ? err.message : String(err)
            }`,
          );
        }
        console.log(
          `[MCP Client] Server not ready (attempt ${attempt}/${maxAttempts}), retrying in ${delayMs}ms...`,
        );
        await new Promise((resolve) => setTimeout(resolve, delayMs));
      }
    }
  }
}
