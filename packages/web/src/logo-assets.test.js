import { IDBFactory } from "fake-indexeddb";
import { describe, expect, it } from "vitest";
import { createBrowserRepositories, openFledgeDatabase, readBackupRecords } from "./indexed-db.js";

describe("immutable business logo assets", () => {
  it("persists scoped logo assets and includes them in encrypted-backup records", async () => {
    const factory = new IDBFactory();
    const database = await openFledgeDatabase(factory);
    const repositories = createBrowserRepositories(database);
    await repositories.businessRepository.save({ id: "business-1" });
    const asset = {
      id: "logo-1",
      businessId: "business-1",
      mimeType: "image/png",
      bytes: [137, 80, 78, 71, 13, 10, 26, 10, 0],
      createdAt: "2026-11-01T00:00:00.000Z",
    };
    await repositories.logoAssetRepository.insert(asset);
    expect(await repositories.logoAssetRepository.get("logo-1")).toEqual(asset);
    expect(repositories.logoAssetRepository).not.toHaveProperty("update");
    expect(repositories.logoAssetRepository).not.toHaveProperty("delete");
    expect((await readBackupRecords(database)).logoAssets).toEqual([asset]);
    database.close();

    const reopened = await openFledgeDatabase(factory);
    const reopenedRepositories = createBrowserRepositories(reopened);
    expect(await reopenedRepositories.logoAssetRepository.get("logo-1")).toEqual(asset);
    reopened.close();
  });

  it("rejects an asset belonging to another business", async () => {
    const database = await openFledgeDatabase(new IDBFactory());
    const repositories = createBrowserRepositories(database);
    await repositories.businessRepository.save({ id: "business-1" });
    await expect(repositories.logoAssetRepository.insert({
      id: "logo-2",
      businessId: "business-2",
      mimeType: "image/png",
      bytes: [137, 80, 78, 71, 13, 10, 26, 10, 0],
      createdAt: "2026-11-01T00:00:00.000Z",
    })).rejects.toThrow(/active business/i);
    database.close();
  });
});
