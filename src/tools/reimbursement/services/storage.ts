import type {
  FormInstance,
  NupCount,
  ReimbursementDraft,
} from "../types";
import { normalizeInstance } from "../forms/defaults";

export interface KeyValueStore {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

export type StorageResult<T> =
  | { ok: true; value: T }
  | { ok: false; error: string };

const STORAGE_KEY = "kefeng-toolkits:reimbursement:v1";
const SCHEMA_VERSION = 1;

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export class ReimbursementStorage {
  constructor(private readonly store: KeyValueStore) {}

  load(): StorageResult<ReimbursementDraft | null> {
    let raw: string | null;
    try {
      raw = this.store.getItem(STORAGE_KEY);
    } catch (error) {
      return {
        ok: false,
        error: `读取报销单草稿失败：${String(error)}`,
      };
    }
    if (raw === null) {
      return { ok: true, value: null };
    }

    try {
      const parsed: unknown = JSON.parse(raw);
      if (
        !isObject(parsed) ||
        parsed.schemaVersion !== SCHEMA_VERSION ||
        !Array.isArray(parsed.instances)
      ) {
        return { ok: false, error: "报销单草稿格式无效" };
      }

      const instances = parsed.instances
        .map((item) => normalizeInstance(item))
        .filter((item): item is FormInstance => item !== null);

      const activeInstanceId =
        typeof parsed.activeInstanceId === "string" &&
        instances.some((item) => item.id === parsed.activeInstanceId)
          ? parsed.activeInstanceId
          : instances[0]?.id ?? null;

      const nup: NupCount =
        parsed.nup === 1 || parsed.nup === 4 ? parsed.nup : 2;

      return {
        ok: true,
        value: {
          schemaVersion: SCHEMA_VERSION,
          instances,
          activeInstanceId,
          nup,
        },
      };
    } catch (error) {
      return {
        ok: false,
        error: `报销单草稿解析失败：${String(error)}`,
      };
    }
  }

  save(draft: ReimbursementDraft): StorageResult<void> {
    try {
      this.store.setItem(
        STORAGE_KEY,
        JSON.stringify({ ...draft, schemaVersion: SCHEMA_VERSION }),
      );
      return { ok: true, value: undefined };
    } catch (error) {
      return {
        ok: false,
        error: `报销单草稿保存失败：${String(error)}`,
      };
    }
  }
}
