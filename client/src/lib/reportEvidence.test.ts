import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  classifyAttachments,
  countByStatus,
  hasOutstanding,
  MAX_ATTACHMENT_BYTES,
  MAX_ATTACHMENTS,
  rejectionFor,
  uploadPending,
  type Attachment,
  type EvidenceSend,
} from "./reportEvidence";

/**
 * The client's attachment state machine (US-5 AC 2–6).
 *
 * The module is deliberately browser-light: it takes a `File`, and the only
 * DOM object it touches is `FileReader`, so the whole feature unit — limits,
 * rejection order, ordering, the sequential resume-on-retry loop — is testable
 * under vitest's node environment with one small polyfill. What is NOT tested
 * here is transport: `EvidenceSend` is injected, so no tRPC client is involved
 * and the US-6 swap (presigned multipart) changes nothing about these rules.
 */

class FakeFileReader {
  result: string | ArrayBuffer | null = null;
  error: DOMException | null = null;
  onerror: ((event: unknown) => void) | null = null;
  onload: ((event: unknown) => void) | null = null;
  readAsDataURL(file: Blob): void {
    file
      .arrayBuffer()
      .then(buffer => {
        const base64 = Buffer.from(buffer).toString("base64");
        this.result = `data:${file.type};base64,${base64}`;
        this.onload?.({});
      })
      .catch(error => {
        this.error = error as DOMException;
        this.onerror?.({});
      });
  }
}

beforeEach(() => {
  (globalThis as unknown as { FileReader: unknown }).FileReader =
    FakeFileReader as unknown as typeof FileReader;
});

function photo(name: string, size = 1024): File {
  return new File([new Uint8Array(size)], name, { type: "image/jpeg" });
}

function sent(file: File): Attachment {
  return { id: "att-1", file, status: "sent" };
}

describe("rejectionFor", () => {
  it("refuses beyond the attachment cap before looking at anything else", () => {
    // Twelve photos picked at once: the resident is told the count, not walked
    // through one oversized file at a time.
    expect(rejectionFor(photo("ok.jpg"), MAX_ATTACHMENTS)).toBe("TOO_MANY");
  });

  it("refuses a photo larger than the cap even when its type is fine", () => {
    expect(rejectionFor(photo("big.jpg", MAX_ATTACHMENT_BYTES + 1), 0)).toBe("TOO_LARGE");
  });

  it("refuses anything the server will refuse as unsupported", () => {
    expect(
      rejectionFor(new File(["hi"], "notes.txt", { type: "text/plain" }), 0),
    ).toBe("UNSUPPORTED");
  });

  it("accepts an image and a PDF", () => {
    expect(rejectionFor(photo("photo.jpg"), 0)).toBeNull();
    expect(
      rejectionFor(new File(["%PDF-1.7"], "scan.pdf", { type: "application/pdf" }), 0),
    ).toBeNull();
  });
});

describe("classifyAttachments", () => {
  it("keeps the resident's picking order and reports the first refusal", () => {
    const existing = [sent(photo("already.jpg"))];
    const { accepted, rejected } = classifyAttachments(
      [photo("a.jpg"), photo("big.jpg", MAX_ATTACHMENT_BYTES + 1), photo("b.jpg")],
      existing,
    );
    expect(accepted.map(a => a.file.name)).toEqual(["a.jpg", "b.jpg"]);
    expect(accepted[0].status).toBe("ready");
    expect(rejected).toEqual(["TOO_LARGE"]);
  });

  it("assigns each accepted file a distinct id so React can key them", () => {
    const { accepted } = classifyAttachments([photo("a.jpg"), photo("b.jpg")], []);
    expect(accepted[0].id).not.toBe(accepted[1].id);
  });
});

describe("uploadPending (US-5 AC 6: resume, never duplicate)", () => {
  it("sends only what is not already sent, in order, one at a time", async () => {
    const calls: string[] = [];
    const send: EvidenceSend = async input => {
      calls.push(input.fileName);
      return undefined;
    };
    const first = sent(photo("already.jpg"));
    const second: Attachment = { id: "att-2", file: photo("pending.jpg"), status: "ready" };
    const result = await uploadPending(9, [first, second], send);
    expect(calls).toEqual(["pending.jpg"]);
    expect(result[0].status).toBe("sent");
    expect(result[1].status).toBe("sent");
  });

  it("marks a file failed without throwing, so one failure never hides the report", async () => {
    const failing: EvidenceSend = async () => {
      throw new Error("network dropped");
    };
    const pending: Attachment = { id: "att-3", file: photo("storm.jpg"), status: "ready" };
    const result = await uploadPending(9, [pending], failing);
    expect(result[0].status).toBe("failed");
  });

  it("reports a failed retry as failed rather than silently dropping it", async () => {
    let attempts = 0;
    const flaky: EvidenceSend = async () => {
      attempts += 1;
      if (attempts === 1) throw new Error("network dropped");
      return undefined;
    };
    const pending: Attachment = { id: "att-4", file: photo("storm.jpg"), status: "failed" };
    const first = await uploadPending(9, [pending], flaky);
    expect(first[0].status).toBe("failed");
    const retried = await uploadPending(9, first, flaky);
    expect(retried[0].status).toBe("sent");
  });
});

describe("status helpers", () => {
  it("counts by status", () => {
    const list = [
      sent(photo("a.jpg")),
      { id: "b", file: photo("b.jpg"), status: "failed" as const },
      { id: "c", file: photo("c.jpg"), status: "failed" as const },
    ];
    expect(countByStatus(list, "failed")).toBe(2);
  });

  it("only considers ready and failed files outstanding", () => {
    const allSent = [sent(photo("a.jpg")), sent(photo("b.jpg"))];
    expect(hasOutstanding(allSent)).toBe(false);
    expect(hasOutstanding([...allSent, { id: "c", file: photo("c.jpg"), status: "failed" }])).toBe(true);
    expect(hasOutstanding([{ id: "d", file: photo("d.jpg"), status: "ready" }])).toBe(true);
    expect(hasOutstanding([])).toBe(false);
  });
});