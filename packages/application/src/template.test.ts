import { describe, expect, it } from "vitest";
import { listTemplates, type InvoiceTemplate, type TemplateDeps } from "./template.js";

const template = {
  id: "template-1",
  businessId: "business-1",
  active: true,
} as InvoiceTemplate;

function deps(overrides: Partial<TemplateDeps["repository"]> = {}): TemplateDeps {
  const repository: TemplateDeps["repository"] = {
    getBusinessId: async () => "business-1",
    getBusiness: async () => null,
    ensureBuiltIns: async () => undefined,
    list: async () => [template],
    get: async () => template,
    setDefault: async () => undefined,
    saveRevision: async () => "template-2",
  };
  Object.assign(repository, overrides);
  return {
    repository,
    now: () => "2026-11-01T00:00:00.000Z",
  };
}

describe("async template application workflows", () => {
  it("waits for built-in installation and template listing before resolving", async () => {
    let releaseList!: () => void;
    let signalListStarted!: () => void;
    const listStarted = new Promise<void>((resolve) => { signalListStarted = resolve; });
    const listGate = new Promise<void>((resolve) => { releaseList = resolve; });
    let resolved = false;

    const templateDeps = deps({
      list: async () => {
        signalListStarted();
        await listGate;
        return [template];
      },
    });

    const result = listTemplates(templateDeps).then((templates) => {
      resolved = true;
      return templates;
    });

    await listStarted;
    expect(resolved).toBe(false);
    releaseList();
    await expect(result).resolves.toEqual([template]);
    expect(resolved).toBe(true);
  });

  it("propagates template repository read failures", async () => {
    const failure = new Error("template storage unavailable");
    const templateDeps = deps({
      list: async () => { throw failure; },
    });

    await expect(listTemplates(templateDeps)).rejects.toBe(failure);
  });

  it("waits for built-in installation before listing templates", async () => {
    let builtInsReady = false;
    const templateDeps = deps({
      ensureBuiltIns: async () => {
        await Promise.resolve();
        builtInsReady = true;
      },
      list: async () => {
        expect(builtInsReady).toBe(true);
        return [template];
      },
    });

    await expect(listTemplates(templateDeps)).resolves.toEqual([template]);
  });
});
