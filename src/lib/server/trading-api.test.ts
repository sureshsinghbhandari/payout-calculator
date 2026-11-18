import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// The module is server-only; under Vitest that guard has nothing to protect.
vi.mock("server-only", () => ({}));

import { listTradingTabs } from "./trading-api";

const TABS = { version: 1, tabs: [{ slug: "ashwin", label: "Ashwin", market: "US", currency: "USD" }] };

describe("trading API client", () => {
  const fetchMock = vi.fn();

  beforeEach(() => {
    vi.stubGlobal("fetch", fetchMock);
    vi.stubEnv("TRADING_API_TOKEN", "test-token");
    fetchMock.mockReset();
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("takes the host only from TRADING_API_URL (trailing slash dropped) and sends the ngrok header", async () => {
    vi.stubEnv("TRADING_API_URL", "https://new-host.ngrok-free.dev/");
    fetchMock.mockResolvedValue(new Response(JSON.stringify(TABS), { status: 200 }));

    const result = await listTradingTabs();

    expect(result.ok).toBe(true);
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("https://new-host.ngrok-free.dev/api/public/eod-excel/tabs");
    expect(init.headers).toMatchObject({ Authorization: "Bearer test-token", "ngrok-skip-browser-warning": "1" });

    // Changing the setting changes the host, with no code change.
    vi.stubEnv("TRADING_API_URL", "https://other-host.ngrok-free.dev");
    fetchMock.mockResolvedValue(new Response(JSON.stringify(TABS), { status: 200 }));
    await listTradingTabs();
    expect((fetchMock.mock.calls[1] as [string])[0]).toBe("https://other-host.ngrok-free.dev/api/public/eod-excel/tabs");
  });

  it("treats an HTML reply (ngrok's warning page) as an outage and logs its first 200 characters", async () => {
    vi.stubEnv("TRADING_API_URL", "https://new-host.ngrok-free.dev");
    const html = `<!DOCTYPE html><html>${"x".repeat(500)}</html>`;
    fetchMock.mockResolvedValue(new Response(html, { status: 200, headers: { "content-type": "text/html" } }));
    const logged = vi.spyOn(console, "error").mockImplementation(() => {});

    const result = await listTradingTabs();

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.status).toBeNull();
    const message = String(logged.mock.calls[0]?.[0]);
    expect(message).toContain(html.slice(0, 200));
    expect(message).not.toContain(html.slice(0, 201));
  });
});
