// ============================================================================
// TollGate — GitHub MCP Client
//
// Connects to the GitHub MCP server (official from GitHub) to read repos,
// get file contents, list commits, and understand code changes.
// The GitHub MCP server runs as a Docker container or binary and
// communicates over stdio using JSON-RPC 2.0.
//
// Setup:
//   1. Get a GitHub PAT: https://github.com/settings/personal-access-tokens/new
//   2. Set env: GITHUB_PERSONAL_ACCESS_TOKEN=ghp_xxx
//   3. Pull Docker image: docker pull ghcr.io/github/github-mcp-server
//
// OR use npx: npx @modelcontextprotocol/server-github
// ============================================================================

import { ChildProcess, spawn } from "child_process";

// ── JSON-RPC 2.0 Types ─────────────────────────────────────────────────────

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
    error?: { code: number; message: string; data?: unknown };
}

// ── Tool Response Type ──────────────────────────────────────────────────────

export interface GitHubToolResponse {
    success: boolean;
    content?: Array<{ type: string; text?: string }>;
    error?: string;
}

// ── GitHub MCP Client ───────────────────────────────────────────────────────

export class GitHubMCPClient {
    private process: ChildProcess | null = null;
    private requestId = 0;
    private buffer = "";
    private pendingRequests = new Map<
        number,
        {
            resolve: (value: JsonRpcResponse) => void;
            reject: (reason: Error) => void;
        }
    >();
    private _isConnected = false;
    private githubToken: string;

    constructor(githubToken?: string) {
        this.githubToken =
            githubToken ??
            process.env.GITHUB_PERSONAL_ACCESS_TOKEN ??
            process.env.GITHUB_PAT ??
            "";
    }

    // ── Lifecycle ─────────────────────────────────────────────────────────────

    /**
     * Start the GitHub MCP server.
     * Uses Docker by default, falls back to npx if Docker is unavailable.
     */
    async start(mode: "docker" | "npx" = "docker"): Promise<void> {
        if (this._isConnected) return;

        if (!this.githubToken) {
            throw new Error(
                "GitHub PAT is required. Set GITHUB_PERSONAL_ACCESS_TOKEN or GITHUB_PAT env variable."
            );
        }

        console.log(`[GitHub MCP] Starting in ${mode} mode...`);

        if (mode === "docker") {
            const dockerCmd = process.platform === "win32" ? "docker.exe" : "docker";
            this.process = spawn(
                dockerCmd,
                ["run", "--rm", "-i", "-e", `GITHUB_PERSONAL_ACCESS_TOKEN=${this.githubToken}`, "ghcr.io/github/github-mcp-server"],
                { stdio: ["pipe", "pipe", "pipe"], shell: process.platform === "win32", env: { ...process.env } }
            );
        } else {
            // On Windows, npx is a .cmd script and requires "npx.cmd"
            const npxCmd = process.platform === "win32" ? "npx.cmd" : "npx";
            this.process = spawn(
                npxCmd,
                ["-y", "@modelcontextprotocol/server-github"],
                {
                    stdio: ["pipe", "pipe", "pipe"],
                    shell: process.platform === "win32",
                    env: {
                        ...process.env,
                        GITHUB_PERSONAL_ACCESS_TOKEN: this.githubToken,
                    },
                }
            );
        }

        this.process.stdout?.on("data", (data: Buffer) => this.handleStdout(data));
        this.process.stderr?.on("data", (data: Buffer) => {
            const msg = data.toString().trim();
            if (msg) console.log(`[GitHub MCP Server] ${msg}`);
        });

        this.process.on("error", (err) => {
            console.error("[GitHub MCP] Process error:", err.message);
            this._isConnected = false;
        });

        this.process.on("exit", (code) => {
            console.log(`[GitHub MCP] Process exited with code ${code}`);
            this._isConnected = false;
        });

        // Wait for server startup — npx may need to download on first run (up to 15s)
        await new Promise((resolve) => setTimeout(resolve, 8000));

        // Initialize MCP protocol
        await this.initialize();
        this._isConnected = true;
        console.log("[GitHub MCP] Connected and initialized");
    }

    async stop(): Promise<void> {
        if (this.process) {
            this.process.kill("SIGTERM");
            this.process = null;
            this._isConnected = false;
        }
    }

    get isConnected(): boolean {
        return this._isConnected;
    }

    // ── High-Level GitHub Actions ─────────────────────────────────────────────

    /**
     * Get the contents of a file from a GitHub repo.
     */
    async getFileContents(
        owner: string,
        repo: string,
        path: string,
        branch?: string
    ): Promise<GitHubToolResponse> {
        const args: Record<string, unknown> = { owner, repo, path };
        if (branch) args.branch = branch;
        return this.callTool("get_file_contents", args);
    }

    /**
     * List commits for a repo.
     */
    async listCommits(
        owner: string,
        repo: string,
        options?: { sha?: string; per_page?: number; page?: number }
    ): Promise<GitHubToolResponse> {
        return this.callTool("list_commits", {
            owner,
            repo,
            ...options,
        });
    }

    /**
     * Get a specific commit by SHA.
     */
    async getCommit(
        owner: string,
        repo: string,
        sha: string
    ): Promise<GitHubToolResponse> {
        // Use get_file_contents with commit ref, or search code
        return this.callTool("list_commits", {
            owner,
            repo,
            sha,
            per_page: 1,
        });
    }

    /**
     * Search code in a repository.
     */
    async searchCode(query: string): Promise<GitHubToolResponse> {
        return this.callTool("search_code", { query });
    }

    /**
     * Search repositories.
     */
    async searchRepositories(query: string): Promise<GitHubToolResponse> {
        return this.callTool("search_repositories", { query });
    }

    /**
     * Get repository info.
     */
    async getRepository(
        owner: string,
        repo: string
    ): Promise<GitHubToolResponse> {
        return this.callTool("get_file_contents", {
            owner,
            repo,
            path: "",
        });
    }

    /**
     * List open pull requests.
     */
    async listPullRequests(
        owner: string,
        repo: string,
        state: "open" | "closed" | "all" = "open"
    ): Promise<GitHubToolResponse> {
        return this.callTool("list_pull_requests", {
            owner,
            repo,
            state,
        });
    }

    /**
     * Create an issue in a repository.
     */
    async createIssue(
        owner: string,
        repo: string,
        title: string,
        body: string
    ): Promise<GitHubToolResponse> {
        return this.callTool("create_issue", {
            owner,
            repo,
            title,
            body,
        });
    }

    /**
     * Create a pull request.
     */
    async createPullRequest(
        owner: string,
        repo: string,
        title: string,
        body: string,
        head: string,
        base: string
    ): Promise<GitHubToolResponse> {
        return this.callTool("create_pull_request", {
            owner,
            repo,
            title,
            body,
            head,
            base,
        });
    }

    /**
     * Create or update a file in a repository.
     */
    async createOrUpdateFile(
        owner: string,
        repo: string,
        path: string,
        content: string,
        message: string,
        branch: string,
        sha?: string
    ): Promise<GitHubToolResponse> {
        const args: Record<string, unknown> = { owner, repo, path, content, message, branch };
        if (sha) args.sha = sha;
        return this.callTool("create_or_update_file", args);
    }

    /**
     * Create a new branch from a ref.
     */
    async createBranch(
        owner: string,
        repo: string,
        branch: string,
        fromBranch?: string
    ): Promise<GitHubToolResponse> {
        return this.callTool("create_branch", {
            owner,
            repo,
            branch,
            from_branch: fromBranch ?? "main",
        });
    }

    /**
     * Push multiple files to a branch in one commit.
     */
    async pushFiles(
        owner: string,
        repo: string,
        branch: string,
        files: Array<{ path: string; content: string }>,
        message: string
    ): Promise<GitHubToolResponse> {
        return this.callTool("push_files", {
            owner,
            repo,
            branch,
            files,
            message,
        });
    }

    /**
     * List all available tools.
     */
    async listTools(): Promise<string[]> {
        const response = await this.sendRequest("tools/list", {});
        const result = response.result as { tools?: Array<{ name: string }> };
        return result?.tools?.map((t) => t.name) ?? [];
    }

    // ── Low-Level Communication ───────────────────────────────────────────────

    async callTool(
        toolName: string,
        toolArgs: Record<string, unknown>
    ): Promise<GitHubToolResponse> {
        try {
            const response = await this.sendRequest("tools/call", {
                name: toolName,
                arguments: toolArgs,
            });

            if (response.error) {
                return { success: false, error: response.error.message };
            }

            const result = response.result as {
                content?: Array<{ type: string; text?: string }>;
                isError?: boolean;
            };

            if (result?.isError) {
                const errorText =
                    result.content?.find((c) => c.type === "text")?.text ?? "Unknown error";
                return { success: false, error: errorText };
            }

            return { success: true, content: result?.content };
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
        params: Record<string, unknown>
    ): Promise<JsonRpcResponse> {
        if (!this.process?.stdin) {
            throw new Error("GitHub MCP server is not running");
        }

        const id = ++this.requestId;
        const request: JsonRpcRequest = { jsonrpc: "2.0", id, method, params };

        return new Promise<JsonRpcResponse>((resolve, reject) => {
            const timeout = setTimeout(() => {
                this.pendingRequests.delete(id);
                reject(new Error(`Request ${method} timed out after 30s`));
            }, 30000);

            this.pendingRequests.set(id, {
                resolve: (response) => { clearTimeout(timeout); resolve(response); },
                reject: (err) => { clearTimeout(timeout); reject(err); },
            });

            this.process!.stdin!.write(JSON.stringify(request) + "\n");
        });
    }

    private handleStdout(data: Buffer): void {
        this.buffer += data.toString();
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
                // Not JSON
            }
        }
    }

    private async initialize(): Promise<void> {
        const response = await this.sendRequest("initialize", {
            protocolVersion: "2024-11-05",
            capabilities: {},
            clientInfo: { name: "TollGate", version: "0.1.0" },
        });

        if (response.error) {
            throw new Error(`GitHub MCP init failed: ${response.error.message}`);
        }

        // Send initialized notification
        this.process?.stdin?.write(
            JSON.stringify({ jsonrpc: "2.0", method: "notifications/initialized" }) + "\n"
        );
    }
}
