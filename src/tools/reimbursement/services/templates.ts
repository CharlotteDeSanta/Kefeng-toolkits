import fieldsMetaJson from "../assets/templates/fields.json";
import travelUrl from "../assets/templates/travel.pdf?url";
import generalUrl from "../assets/templates/general.pdf?url";
import summaryUrl from "../assets/templates/summary.pdf?url";
import privateCarUrl from "../assets/templates/private-car.pdf?url";
import type {
  FormType,
  PdfFieldsMeta,
  PdfFormMeta,
} from "../types";

const fieldsMeta = fieldsMetaJson as unknown as PdfFieldsMeta;

const TEMPLATE_URLS: Record<FormType, string> = {
  travel: travelUrl,
  general: generalUrl,
  summary: summaryUrl,
  "private-car": privateCarUrl,
};

const templateCache = new Map<FormType, Uint8Array>();

export function getPdfFormMeta(type: FormType): PdfFormMeta {
  return fieldsMeta[type];
}

export async function loadTemplate(
  type: FormType,
): Promise<{ bytes: Uint8Array; meta: PdfFormMeta }> {
  let bytes = templateCache.get(type);
  if (!bytes) {
    const response = await fetch(TEMPLATE_URLS[type]);
    if (!response.ok) {
      throw new Error(`加载 ${type} 模板失败：HTTP ${response.status}`);
    }
    bytes = new Uint8Array(await response.arrayBuffer());
    templateCache.set(type, bytes);
  }

  return { bytes, meta: fieldsMeta[type] };
}
