import type { PDFDocument, PDFFont } from "pdf-lib";
import wasmUrl from "hb-subset-wasm/hb-subset.wasm?url";
import { readSystemFont } from "./files";

type HbModule = typeof import("hb-subset-wasm");

const BASE_CHARS =
  " 0123456789.,:-/\\()[]{}<>+-*=¥%$#@&_~'\"`…" +
  "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz" +
  "年月日时分号第共合计人天间夜公里费车船住宿伙食补贴差旅项目姓名编号备注附件张单据出纳主管复核报销人用途车牌同行人数地址电话" +
  "零壹贰叁肆伍陆柒捌玖拾佰仟万亿圆元角分整" +
  "，。、；：！？（）《》“”‘’【】";

let hbPromise: Promise<HbModule> | null = null;
let fontkitPromise: Promise<unknown> | null = null;
const rawFontCache = new Map<"simsun" | "yahei", Uint8Array>();

async function loadHarfBuzz(): Promise<HbModule> {
  if (!hbPromise) {
    hbPromise = (async () => {
      const hb = await import("hb-subset-wasm");
      const response = await fetch(wasmUrl);
      if (!response.ok) {
        throw new Error(`加载字体子集模块失败：HTTP ${response.status}`);
      }
      const bytes = await response.arrayBuffer();
      await hb.init(bytes);
      return hb;
    })();
  }
  return hbPromise;
}

async function loadFontkit(): Promise<unknown> {
  if (!fontkitPromise) {
    fontkitPromise = import("@pdf-lib/fontkit").then(
      (module) =>
        (module as unknown as { default?: unknown }).default ?? module,
    );
  }
  return fontkitPromise;
}

async function loadRawFont(kind: "simsun" | "yahei"): Promise<Uint8Array> {
  const cached = rawFontCache.get(kind);
  if (cached) {
    return cached;
  }
  const bytes = await readSystemFont(kind);
  rawFontCache.set(kind, bytes);
  return bytes;
}

function assertGlyphCoverage(
  font: PDFFont,
  text: string,
  fontLabel: string,
): void {
  const available = new Set(font.getCharacterSet());
  const missing = new Set<string>();
  for (const char of Array.from(text)) {
    if (char === "\n" || char === "\r" || char === "\t") {
      continue;
    }
    const code = char.codePointAt(0);
    if (code !== undefined && !available.has(code)) {
      missing.add(char);
    }
  }
  if (missing.size > 0) {
    throw new Error(
      `${fontLabel}缺少以下字符，无法在 PDF 中正确显示：${[...missing].join("")}`,
    );
  }
}

/**
 * 读取系统宋体/微软雅黑，按实际用到的字符做 HarfBuzz 子集，再嵌入输出 PDF。
 * 只嵌入子集，不把系统字体文件复制进应用。
 */
export async function embedReimbursementFonts(
  pdf: PDFDocument,
  dynamicText: string,
): Promise<{ simsun: PDFFont; yahei: PDFFont }> {
  const hb = await loadHarfBuzz();
  const fontkit = await loadFontkit();
  const text = `${BASE_CHARS}${dynamicText}`;

  const [simsunRaw, yaheiRaw] = await Promise.all([
    loadRawFont("simsun"),
    loadRawFont("yahei"),
  ]);

  const [simsunSubset, yaheiSubset] = await Promise.all([
    hb.subset(simsunRaw, {
      text,
      layoutFeatures: "*",
      noHinting: true,
    }),
    hb.subset(yaheiRaw, {
      text,
      layoutFeatures: "*",
      noHinting: true,
    }),
  ]);

  pdf.registerFontkit(
    fontkit as Parameters<PDFDocument["registerFontkit"]>[0],
  );

  const [simsun, yahei] = await Promise.all([
    pdf.embedFont(simsunSubset, { subset: false }),
    pdf.embedFont(yaheiSubset, { subset: false }),
  ]);

  assertGlyphCoverage(simsun, text, "系统宋体");
  assertGlyphCoverage(yahei, text, "系统微软雅黑");

  return { simsun, yahei };
}
