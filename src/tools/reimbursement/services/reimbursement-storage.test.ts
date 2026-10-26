import { describe, expect, it } from "vitest";
import { createTravelData } from "../forms/defaults";
import type { ReimbursementDraft } from "../types";
import { ReimbursementStorage, type KeyValueStore } from "./storage";

class MemoryStore implements KeyValueStore {
  readonly values = new Map<string, string>();

  getItem(key: string): string | null {
    return this.values.get(key) ?? null;
  }

  setItem(key: string, value: string): void {
    this.values.set(key, value);
  }
}

describe("reimbursement draft storage", () => {
  it("round-trips instances, active id, and N-up", () => {
    const kv = new MemoryStore();
    const storage = new ReimbursementStorage(kv);
    const data = createTravelData();
    data.name = "曹铮";
    data.rows[0].vehicleAmount = "12.34";

    const draft: ReimbursementDraft = {
      schemaVersion: 1,
      instances: [
        {
          id: "travel-1",
          type: "travel",
          title: "差旅报销单 1",
          data,
        },
      ],
      activeInstanceId: "travel-1",
      nup: 4,
    };

    expect(storage.save(draft).ok).toBe(true);
    const loaded = storage.load();
    expect(loaded.ok).toBe(true);
    if (!loaded.ok || !loaded.value) {
      throw new Error("expected loaded draft");
    }
    expect(loaded.value.nup).toBe(4);
    expect(loaded.value.activeInstanceId).toBe("travel-1");
    expect(loaded.value.instances).toHaveLength(1);
    const instance = loaded.value.instances[0];
    expect(instance.type).toBe("travel");
    if (instance.type === "travel") {
      expect(instance.data.name).toBe("曹铮");
      expect(instance.data.rows[0].vehicleAmount).toBe("12.34");
      expect(instance.data.rows).toHaveLength(27);
    }
  });

  it("rejects malformed JSON", () => {
    const kv = new MemoryStore();
    kv.values.set("kefeng-toolkits:reimbursement:v1", "{bad");
    const storage = new ReimbursementStorage(kv);
    expect(storage.load().ok).toBe(false);
  });
});
