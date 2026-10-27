import type { SignatureImage, SignatureMime } from "../types";

export const MAX_SIGNATURE_FILE_BYTES = 10 * 1024 * 1024;
export const MAX_SIGNATURE_DATA_URL_CHARS = 1_500_000;

const MAX_SIGNATURE_DIMENSION = 1200;
const PNG_SIGNATURE = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];

/** 通过文件头判断真实图片格式，不信任扩展名。 */
export function detectImageMime(bytes: Uint8Array): SignatureMime | null {
  if (
    bytes.length >= PNG_SIGNATURE.length &&
    PNG_SIGNATURE.every((value, index) => bytes[index] === value)
  ) {
    return "image/png";
  }
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) {
    return "image/jpeg";
  }
  return null;
}

export function bytesToDataUrl(bytes: Uint8Array, mime: SignatureMime): string {
  const chunkSize = 0x8000;
  const parts: string[] = [];
  for (let offset = 0; offset < bytes.length; offset += chunkSize) {
    parts.push(
      String.fromCharCode(...bytes.subarray(offset, offset + chunkSize)),
    );
  }
  return `data:${mime};base64,${btoa(parts.join(""))}`;
}

export function dataUrlToBytes(dataUrl: string): {
  bytes: Uint8Array;
  mime: SignatureMime;
} {
  const match = /^data:(image\/(?:png|jpeg));base64,([A-Za-z0-9+/=\s]+)$/.exec(
    dataUrl,
  );
  if (!match) {
    throw new Error("签名图片数据格式无效");
  }

  let binary: string;
  try {
    binary = atob(match[2].replace(/\s/g, ""));
  } catch {
    throw new Error("签名图片编码无效");
  }

  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }
  return { bytes, mime: match[1] as SignatureMime };
}

/** 导出前再次校验 data URL、MIME 与文件头是否一致。 */
export function decodeSignature(signature: SignatureImage): {
  bytes: Uint8Array;
  mime: SignatureMime;
} {
  const parsed = dataUrlToBytes(signature.dataUrl);
  if (parsed.mime !== signature.mime) {
    throw new Error("签名图片格式与保存记录不一致");
  }
  if (detectImageMime(parsed.bytes) !== parsed.mime) {
    throw new Error("签名图片内容无效，请重新选择图片");
  }
  return parsed;
}

export interface ImageRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

/** 等比缩放并居中到目标矩形内。 */
export function fitImageRect(
  imageWidth: number,
  imageHeight: number,
  rect: ImageRect,
  padding = 0,
): ImageRect | null {
  const availableWidth = rect.width - padding * 2;
  const availableHeight = rect.height - padding * 2;
  if (
    !(imageWidth > 0) ||
    !(imageHeight > 0) ||
    !(availableWidth > 0) ||
    !(availableHeight > 0)
  ) {
    return null;
  }

  const scale = Math.min(
    availableWidth / imageWidth,
    availableHeight / imageHeight,
  );
  const width = imageWidth * scale;
  const height = imageHeight * scale;
  return {
    x: rect.x + (rect.width - width) / 2,
    y: rect.y + (rect.height - height) / 2,
    width,
    height,
  };
}

function loadImage(blob: Blob): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(blob);
    const image = new Image();
    image.onload = () => {
      URL.revokeObjectURL(url);
      resolve(image);
    };
    image.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("无法读取签名图片，请确认文件未损坏"));
    };
    image.src = url;
  });
}

/**
 * 读取用户选择的 JPG/PNG，按最长边 1200px 缩小后转成 data URL。
 * data URL 超过 localStorage 可承受的大小时继续缩小，仍超限则报错。
 */
export async function prepareSignatureImage(
  bytes: Uint8Array,
  fileName: string,
): Promise<SignatureImage> {
  const mime = detectImageMime(bytes);
  if (mime === null) {
    throw new Error("仅支持 JPG/PNG 格式的签名图片");
  }
  if (bytes.byteLength > MAX_SIGNATURE_FILE_BYTES) {
    throw new Error("签名图片不能超过 10 MB");
  }
  if (typeof document === "undefined") {
    throw new Error("当前环境不支持图片处理");
  }

  const buffer = bytes.buffer.slice(
    bytes.byteOffset,
    bytes.byteOffset + bytes.byteLength,
  ) as ArrayBuffer;
  const image = await loadImage(new Blob([buffer], { type: mime }));
  if (image.naturalWidth <= 0 || image.naturalHeight <= 0) {
    throw new Error("签名图片尺寸无效");
  }

  let scale = Math.min(
    1,
    MAX_SIGNATURE_DIMENSION /
      Math.max(image.naturalWidth, image.naturalHeight),
  );
  let dataUrl = "";
  let width = 0;
  let height = 0;

  for (let attempt = 0; attempt < 4; attempt += 1) {
    width = Math.max(1, Math.round(image.naturalWidth * scale));
    height = Math.max(1, Math.round(image.naturalHeight * scale));
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext("2d");
    if (!context) {
      throw new Error("无法创建签名图片画布");
    }
    context.drawImage(image, 0, 0, width, height);
    dataUrl = canvas.toDataURL(
      mime,
      mime === "image/jpeg" ? 0.92 : undefined,
    );
    if (dataUrl.length <= MAX_SIGNATURE_DATA_URL_CHARS) {
      break;
    }
    scale *= 0.75;
  }

  if (dataUrl.length === 0 || dataUrl.length > MAX_SIGNATURE_DATA_URL_CHARS) {
    throw new Error("签名图片过大，请选择更小的图片（建议 1 MB 以内）");
  }

  return {
    dataUrl,
    mime,
    fileName: fileName.trim() || "签名图片",
    width,
    height,
  };
}
