import { describe, expect, it } from "vitest";
import { readJson } from "@/lib/http";

function streamed(chunks: Uint8Array[], headers?: HeadersInit) {
  let canceled = false;
  const body = new ReadableStream<Uint8Array>({
    pull(controller) {
      const chunk = chunks.shift();
      if (chunk) controller.enqueue(chunk);
      else controller.close();
    },
    cancel() { canceled = true; },
  });
  return {
    request: new Request("https://example.test", { method: "POST", body, headers, duplex: "half" } as RequestInit),
    canceled: () => canceled,
  };
}

describe("streamed JSON limits", () => {
  it("counts UTF-8 bytes rather than characters and cancels oversize streams", async () => {
    const input = streamed([new TextEncoder().encode('"😀😀"'), new Uint8Array(500)]);
    await expect(readJson(input.request, 8)).rejects.toThrow("Request body is too large");
    expect(input.canceled()).toBe(true);
  });

  it("enforces the limit with absent or dishonest Content-Length", async () => {
    for (const headers of [undefined, { "content-length": "1" }]) {
      const input = streamed([new Uint8Array(9), new Uint8Array(9)], headers);
      await expect(readJson(input.request, 8)).rejects.toThrow("Request body is too large");
      expect(input.canceled()).toBe(true);
    }
  });

  it("rejects an oversized declared length before consuming the body", async () => {
    const input = streamed([new Uint8Array(100)], { "content-length": "100" });
    await expect(readJson(input.request, 8)).rejects.toThrow("Request body is too large");
    expect(input.canceled()).toBe(true);
  });

  it("decodes split multibyte sequences and accepts the exact byte limit", async () => {
    const bytes = new TextEncoder().encode('"😀"');
    const input = streamed([bytes.slice(0, 3), bytes.slice(3)]);
    await expect(readJson(input.request, bytes.length)).resolves.toBe("😀");
  });

  it("rejects invalid UTF-8 and malformed JSON", async () => {
    await expect(readJson(streamed([new Uint8Array([34, 255, 34])]).request)).rejects.toThrow("Request body must be JSON");
    await expect(readJson(new Request("https://example.test", { method: "POST", body: "{" }))).rejects.toThrow("Request body must be JSON");
  });
});
