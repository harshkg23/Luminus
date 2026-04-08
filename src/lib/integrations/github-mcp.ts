import { ChildProcess, spawn } from "child_process";

interface JsonRpcRequest {
  jsonrpc: "2.0";
  id?: number;
  method: string;
  params?: Record<string, unknown>;
}

interface JsonRpcResponse {
  jsonrpc: "2.0";
  id: number;
  result?: unknown;
  error?: { code: number; message: string };
}

interface ToolResponse {
  content?: Array<{ type: string; text?: string }>;
  isError?: boolean;
}

export class GitHubMCPClient {
  private process: ChildProcess | null = null;
  private buffer = "";
  private requestId = 0;
  private pending = new Map<
    number,
    { resolve: (value: JsonRpcResponse) => void; reject: (reason: Error) => void }
  >();
  private token: string;

  constructor() {
    this.token =
      process.env.GITHUB_PERSONAL_ACCESS_TOKEN ??
      process.env.GITHUB_PAT ??
      "";
  }

  async start(mode: "docker" | "npx" = "npx"): Promise<void> {
    if (this.process) return;
    if (!this.token) {
      throw new Error("Missing GitHub token: set GITHUB_PERSONAL_ACCESS_TOKEN.");
    }

    if (mode === "docker") {
      const dockerCmd = process.platform === "win32" ? "docker.exe" : "docker";
      this.process = spawn(
        dockerCmd,
        [
          "run",
          "--rm",
          "-i",
          "-e",
          `GITHUB_PERSONAL_ACCESS_TOKEN=${this.token}`,
          "ghcr.io/github/github-mcp-server",
        ],
        { stdio: ["pipe", "pipe", "pipe"], shell: process.platform === "win32" },
      );
    } else {
      const npxCmd = process.platform === "win32" ? "npx.cmd" : "npx";
      this.process = spawn(npxCmd, ["-y", "@modelcontextprotocol/server-github"], {
        stdio: ["pipe", "pipe", "pipe"],
        shell: process.platform === "win32",
        env: { ...process.env, GITHUB_PERSONAL_ACCESS_TOKEN: this.token },
      });
    }

    this.process.stdout?.on("data", (data: Buffer) => this.onStdout(data));
    this.process.stderr?.on("data", () => {});
    this.process.on("exit", () => {
      this.process = null;
    });

    await new Promise((resolve) => setTimeout(resolve, 7000));
    await this.initialize();
  }

  async stop(): Promise<void> {
    if (!this.process) return;
    this.process.kill("SIGTERM");
    this.process = null;
  }

  async listPullRequests(
    owner: string,
    repo: string,
    state: "open" | "closed" | "all" = "open",
  ): Promise<unknown[]> {
    const result = await this.callTool("list_pull_requests", { owner, repo, state });
    return this.parseTextJson(result);
  }

  private parseTextJson(result: ToolResponse): unknown[] {
    const text = result.content?.find((c) => c.type === "text")?.text;
    if (!text) return [];
    try {
      const parsed = JSON.parse(text);
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  }

  private async callTool(name: string, args: Record<string, unknown>): Promise<ToolResponse> {
    const response = await this.send("tools/call", { name, arguments: args });
    if (response.error) {
      throw new Error(response.error.message);
    }
    const result = (response.result ?? {}) as ToolResponse;
    if (result.isError) {
      throw new Error("GitHub MCP tool returned an error");
    }
    return result;
  }

  private async initialize(): Promise<void> {
    await this.send("initialize", {
      protocolVersion: "2024-11-05",
      capabilities: {},
      clientInfo: { name: "Luminus", version: "0.1.0" },
    });
    this.process?.stdin?.write(
      JSON.stringify({ jsonrpc: "2.0", method: "notifications/initialized" }) + "\n",
    );
  }

  private async send(method: string, params: Record<string, unknown>): Promise<JsonRpcResponse> {
    if (!this.process?.stdin) throw new Error("GitHub MCP process is not running");
    const id = ++this.requestId;
    const request: JsonRpcRequest = { jsonrpc: "2.0", id, method, params };

    return new Promise<JsonRpcResponse>((resolve, reject) => {
      const timeout = setTimeout(() => {
        this.pending.delete(id);
        reject(new Error(`Timeout in ${method}`));
      }, 30000);

      this.pending.set(id, {
        resolve: (value) => {
          clearTimeout(timeout);
          resolve(value);
        },
        reject: (err) => {
          clearTimeout(timeout);
          reject(err);
        },
      });

      this.process?.stdin?.write(JSON.stringify(request) + "\n");
    });
  }

  private onStdout(data: Buffer): void {
    this.buffer += data.toString();
    const lines = this.buffer.split("\n");
    this.buffer = lines.pop() ?? "";

    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed) continue;
      try {
        const response = JSON.parse(trimmed) as JsonRpcResponse;
        if (typeof response.id === "number") {
          const pending = this.pending.get(response.id);
          if (pending) {
            this.pending.delete(response.id);
            pending.resolve(response);
          }
        }
      } catch {
        // Ignore non-JSON lines.
      }
    }
  }
}
