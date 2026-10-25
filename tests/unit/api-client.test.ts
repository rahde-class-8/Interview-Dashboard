import { afterEach, describe, expect, it, vi } from "vitest";

import { ApiClientError, api, errorMessage, listAll } from "@/lib/api/client";

const json = (status: number, body: unknown) =>
  new Response(status === 204 ? null : JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

afterEach(() => vi.unstubAllGlobals());

describe("browser API client", () => {
  it("sends JSON to /api/v1 and parses the response", async () => {
    const fetchMock = vi.fn().mockResolvedValue(json(201, { id: "x" }));
    vi.stubGlobal("fetch", fetchMock);
    await expect(api("/things", { method: "POST", body: { a: 1 } })).resolves.toEqual({ id: "x" });
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("/api/v1/things");
    expect(init).toMatchObject({ method: "POST", body: '{"a":1}', credentials: "same-origin", cache: "no-store" });
    expect(init.headers).toEqual({ "Content-Type": "application/json" });
  });

  it("turns error envelopes into ApiClientError with field details", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        json(400, { error: { code: "validation_failed", message: "Bad input.", requestId: "r", details: [{ path: "title", message: "Required." }] } }),
      ),
    );
    const error = (await api("/x", { method: "PATCH", body: {} }).catch((e) => e)) as ApiClientError;
    expect(error).toBeInstanceOf(ApiClientError);
    expect(error).toMatchObject({ status: 400, code: "validation_failed", message: "Bad input." });
    expect(error.fieldErrors()).toEqual({ title: "Required." });
  });

  it("retries reads on 503 and network errors, but never retries writes", async () => {
    vi.useFakeTimers();
    const reads = vi
      .fn()
      .mockRejectedValueOnce(new TypeError("network"))
      .mockResolvedValueOnce(json(503, { error: { code: "storage_unavailable", message: "Down", requestId: "r" } }))
      .mockResolvedValueOnce(json(200, { ok: true }));
    vi.stubGlobal("fetch", reads);
    const pending = api("/x");
    await vi.runAllTimersAsync();
    await expect(pending).resolves.toEqual({ ok: true });
    expect(reads).toHaveBeenCalledTimes(3);

    const writes = vi.fn().mockResolvedValue(json(503, { error: { code: "storage_unavailable", message: "Down", requestId: "r" } }));
    vi.stubGlobal("fetch", writes);
    await expect(api("/x", { method: "POST", body: {} })).rejects.toMatchObject({ status: 503 });
    expect(writes).toHaveBeenCalledTimes(1);
    vi.useRealTimers();
  });

  it("does not retry client errors", async () => {
    const fetchMock = vi.fn().mockResolvedValue(json(404, { error: { code: "not_found", message: "Nope.", requestId: "r" } }));
    vi.stubGlobal("fetch", fetchMock);
    await expect(api("/x")).rejects.toMatchObject({ status: 404 });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("follows cursors to load every page", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(json(200, { data: [1, 2], nextCursor: "c2" }))
      .mockResolvedValueOnce(json(200, { data: [3], nextCursor: null }));
    vi.stubGlobal("fetch", fetchMock);
    await expect(listAll<number>("/items?view=detail")).resolves.toEqual([1, 2, 3]);
    expect(fetchMock.mock.calls.map((c) => c[0])).toEqual(["/api/v1/items?view=detail&limit=200", "/api/v1/items?view=detail&limit=200&cursor=c2"]);
  });

  it("gives a generic message for unexpected errors", () => {
    expect(errorMessage(new Error("internal detail"))).toBe("Something went wrong. Please try again.");
  });
});
