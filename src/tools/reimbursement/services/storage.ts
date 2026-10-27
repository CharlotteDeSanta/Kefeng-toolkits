import type {
  FormInstance,
  NupCount,
  ReimbursementDraft,
  SignatureImage,
} from "../types";
import { normalizeInstance } from "../forms/defaults";
import { MAX_SIGNATURE_DATA_URL_CHARS } from "./signature";

export interface KeyValueStore {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem?(key: string): void;
}

export type StorageResult<T> =
  | { ok: true; value: T }
  | { ok: false; error: string };

const STORAGE_KEY = "kefeng-toolkits:reimbursement:v1";
const SIGNATURE_KEY = "kefeng-toolkits:reimbursement:v1:signature";
const SCHEMA_VERSION = 1;

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isSignatureImage(value: unknown): value is SignatureImage {
  if (!isObject(value)) {
    return false;
  }
  const mime = value.mime;
  if (mime !== "image/png" && mime !== "image/jpeg") {
    return false;
  }
  if (
    typeof value.dataUrl !== "string" ||
    !value.dataUrl.startsWith(`data:${mime};base64,`) ||
    value.dataUrl.length > MAX_SIGNATURE_DATA_URL_CHARS
  ) {
    return false;
  }
  return (
    typeof value.fileName === "string" &&
    typeof value.width === "number" &&
    Number.isFinite(value.width) &&
    value.width > 0 &&
    typeof value.height === "number" &&
    Number.isFinite(value.height) &&
    value.height > 0
  );
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

  loadSignature(): StorageResult<SignatureImage | null> {
    let raw: string | null;
    try {
      raw = this.store.getItem(SIGNATURE_KEY);
    } catch (error) {
      return {
        ok: false,
        error: `读取电子签名失败：${String(error)}`,
      };
    }
    if (raw === null || raw.trim().length === 0) {
      return { ok: true, value: null };
    }

    try {
      const parsed: unknown = JSON.parse(raw);
      if (
        !isObject(parsed) ||
        parsed.schemaVersion !== SCHEMA_VERSION ||
        !isSignatureImage(parsed)
      ) {
        return { ok: false, error: "电子签名格式无效，请重新选择图片" };
      }
      const signature = parsed as SignatureImage;
      return {
        ok: true,
        value: {
          dataUrl: signature.dataUrl,
          mime: signature.mime,
          fileName: signature.fileName,
          width: signature.width,
          height: signature.height,
        },
      };
    } catch (error) {
      return {
        ok: false,
        error: `电子签名解析失败：${String(error)}`,
      };
    }
  }

  saveSignature(signature: SignatureImage): StorageResult<void> {
    try {
      this.store.setItem(
        SIGNATURE_KEY,
        JSON.stringify({ ...signature, schemaVersion: SCHEMA_VERSION }),
      );
      return { ok: true, value: undefined };
    } catch (error) {
      return {
        ok: false,
        error: `电子签名保存失败：${String(error)}`,
      };
    }
  }

  clearSignature(): StorageResult<void> {
    try {
      if (this.store.removeItem) {
        this.store.removeItem(SIGNATURE_KEY);
      } else {
        this.store.setItem(SIGNATURE_KEY, "");
      }
      return { ok: true, value: undefined };
    } catch (error) {
      return {
        ok: false,
        error: `清除电子签名失败：${String(error)}`,
      };
    }
  }
}
