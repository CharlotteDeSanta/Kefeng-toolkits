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

  removeItem(key: string): void {
    this.values.delete(key);
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

describe("reimbursement signature storage", () => {
  it("saves, loads, and clears the local signature", () => {
    const kv = new MemoryStore();
    const storage = new ReimbursementStorage(kv);
    const signature = {
      dataUrl: "data:image/png;base64,iVBORw0KGgo=",
      mime: "image/png" as const,
      fileName: "sign.png",
      width: 320,
      height: 120,
    };

    expect(storage.saveSignature(signature).ok).toBe(true);
    const loaded = storage.loadSignature();
    expect(loaded.ok).toBe(true);
    if (!loaded.ok) {
      throw new Error("expected signature");
    }
    expect(loaded.value?.fileName).toBe("sign.png");
    expect(loaded.value?.width).toBe(320);

    expect(storage.clearSignature().ok).toBe(true);
    const cleared = storage.loadSignature();
    expect(cleared.ok).toBe(true);
    if (!cleared.ok) {
      throw new Error("expected cleared signature");
    }
    expect(cleared.value).toBeNull();
  });

  it("rejects malformed signature data", () => {
    const kv = new MemoryStore();
    kv.values.set(
      "kefeng-toolkits:reimbursement:v1:signature",
      JSON.stringify({
        schemaVersion: 1,
        dataUrl: "https://example.com/sign.png",
        mime: "image/png",
        fileName: "sign.png",
        width: 1,
        height: 1,
      }),
    );
    const storage = new ReimbursementStorage(kv);
    const loaded = storage.loadSignature();
    expect(loaded.ok).toBe(false);
  });
});
