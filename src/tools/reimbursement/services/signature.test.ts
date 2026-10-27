import { describe, expect, it } from "vitest";
import type { SignatureImage } from "../types";
import {
  bytesToDataUrl,
  dataUrlToBytes,
  decodeSignature,
  detectImageMime,
  fitImageRect,
} from "./signature";

const PNG_BYTES = new Uint8Array([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x01, 0x02, 0x03,
]);
const JPEG_BYTES = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0x01]);

describe("signature image format", () => {
  it("detects PNG and JPEG from file headers", () => {
    expect(detectImageMime(PNG_BYTES)).toBe("image/png");
    expect(detectImageMime(JPEG_BYTES)).toBe("image/jpeg");
    expect(detectImageMime(new Uint8Array([1, 2, 3, 4]))).toBeNull();
  });

  it("round-trips bytes through a data URL", () => {
    const dataUrl = bytesToDataUrl(PNG_BYTES, "image/png");
    const decoded = dataUrlToBytes(dataUrl);
    expect(decoded.mime).toBe("image/png");
    expect([...decoded.bytes]).toEqual([...PNG_BYTES]);
  });

  it("rejects a data URL whose MIME no longer matches its bytes", () => {
    const signature: SignatureImage = {
      dataUrl: bytesToDataUrl(PNG_BYTES, "image/png"),
      mime: "image/jpeg",
      fileName: "sign.png",
      width: 10,
      height: 10,
    };
    expect(() => decodeSignature(signature)).toThrow();
  });

  it("rejects malformed data URLs", () => {
    expect(() => dataUrlToBytes("https://example.com/sign.png")).toThrow();
  });
});

describe("signature fit geometry", () => {
  const rect = { x: 10, y: 20, width: 100, height: 50 };

  it("scales landscape images to the limiting edge", () => {
    expect(fitImageRect(200, 100, rect)).toEqual({
      x: 10,
      y: 20,
      width: 100,
      height: 50,
    });
  });

  it("honours padding and centers the image", () => {
    expect(fitImageRect(200, 100, rect, 5)).toEqual({
      x: 20,
      y: 25,
      width: 80,
      height: 40,
    });
  });

  it("returns null for empty images or rectangles", () => {
    expect(fitImageRect(0, 100, rect)).toBeNull();
    expect(fitImageRect(100, 100, { ...rect, width: 0 })).toBeNull();
  });
});
