import { describe, expect, it } from "vitest";
import { getDocument, type BillingDocument, type DocumentDeps } from "./document.js";

function deps(get: DocumentDeps["repository"]["get"]): DocumentDeps {
  return {
    repository: { get } as unknown as DocumentDeps["repository"],
    states: [],
    now: () => "2026-11-01T00:00:00.000Z",
    createId: () => "unused",
  };
}

const finalizedDocument = {
  id: "document-1",
  status: "finalized",
} as BillingDocument;

describe("async document application workflows", () => {
  it("waits for a delayed document read before resolving", async () => {
    let releaseRead!: () => void;
    let signalReadStarted!: () => void;
    const readStarted = new Promise<void>((resolve) => { signalReadStarted = resolve; });
    const readGate = new Promise<void>((resolve) => { releaseRead = resolve; });

    const documentDeps = deps(async () => {
      signalReadStarted();
      await readGate;
      return finalizedDocument;
    });

    let resolved = false;
    const result = getDocument("document-1", documentDeps).then((document) => {
      resolved = true;
      return document;
    });

    await readStarted;
    expect(resolved).toBe(false);

    releaseRead();
    await expect(result).resolves.toBe(finalizedDocument);
    expect(resolved).toBe(true);
  });

  it("propagates document repository read failures", async () => {
    const failure = new Error("document storage unavailable");
    const documentDeps = deps(async () => { throw failure; });

    await expect(getDocument("document-1", documentDeps)).rejects.toBe(failure);
  });
});
