"""Calibrate field rectangles against the rendered template PDFs.

Excel's `Range.Left/Top/Width/Height` values do not always match the geometry
that Excel actually prints or exports. The four reimbursement templates show a
small cumulative scaling error (more visible horizontally), which makes values
drift into neighbouring cells towards the right/bottom of a form.

For every template this script:

1. renders the blank template PDF with pypdfium2;
2. detects the printed horizontal/vertical table rules;
3. pairs the outer rules with the row-field extents from fields.json;
4. derives a linear transform ``actual = a + b * field`` for both axes;
5. rewrites every field rectangle (and the page size) in fields.json.

Development-only helper; the application consumes the generated fields.json.
Run it after scripts/generate-reimbursement-templates.ps1.
"""

from __future__ import annotations

import json
import sys
from pathlib import Path

import pypdfium2 as pdfium
from PIL import Image

PROJECT_ROOT = Path(__file__).resolve().parents[1]
TEMPLATE_DIR = PROJECT_ROOT / "src" / "tools" / "reimbursement" / "assets" / "templates"
FIELDS_PATH = TEMPLATE_DIR / "fields.json"

SCALE = 2
ROW_KEYS = ("rows", "trips")
ANCHOR_TOLERANCE = 35.0


def detect_horizontal_lines(image: Image.Image) -> list[int]:
    """Return image-space y positions of long horizontal table rules."""
    gray = image.convert("L")
    width, height = gray.size
    pixels = gray.load()

    x_start = max(0, int(width * 0.08))
    x_end = min(width, int(width * 0.92))
    required = int((x_end - x_start) * 0.65)

    hits: list[int] = []
    for y in range(height):
        dark = 0
        for x in range(x_start, x_end):
            if pixels[x, y] < 90:
                dark += 1
        if dark >= required:
            hits.append(y)

    groups: list[list[int]] = []
    for y in hits:
        if groups and y - groups[-1][-1] <= 2:
            groups[-1].append(y)
        else:
            groups.append([y])
    return [round(sum(group) / len(group)) for group in groups]


def detect_vertical_lines(image: Image.Image, top: int, bottom: int) -> list[int]:
    """Return image-space x positions of long vertical table rules."""
    gray = image.convert("L")
    width, _ = gray.size
    pixels = gray.load()

    required = int((bottom - top) * 0.75)
    hits: list[int] = []
    for x in range(width):
        dark = 0
        for y in range(top, bottom):
            if pixels[x, y] < 90:
                dark += 1
        if dark >= required:
            hits.append(x)

    groups: list[list[int]] = []
    for x in hits:
        if groups and x - groups[-1][-1] <= 2:
            groups[-1].append(x)
        else:
            groups.append([x])
    return [round(sum(group) / len(group)) for group in groups]


def collect_fields(value: object, output: list[dict]) -> None:
    if isinstance(value, dict):
        if all(key in value for key in ("x", "y", "width", "height")):
            output.append(value)
            return
        for child in value.values():
            collect_fields(child, output)
    elif isinstance(value, list):
        for child in value:
            collect_fields(child, output)


def nearest(values: list[float], target: float, tolerance: float) -> float | None:
    if not values:
        return None
    best = min(values, key=lambda value: abs(value - target))
    return best if abs(best - target) <= tolerance else None


def affine(field_low: float, field_high: float, actual_low: float, actual_high: float) -> tuple[float, float]:
    scale = (actual_high - actual_low) / (field_high - field_low)
    offset = actual_low - scale * field_low
    return scale, offset


def calibrate_form(key: str, meta: dict) -> tuple[int, tuple[float, float], tuple[float, float]]:
    pdf_path = TEMPLATE_DIR / meta["template"]
    pdf = pdfium.PdfDocument(str(pdf_path))
    page = pdf[0]
    page_width, page_height = page.get_size()
    image = page.render(scale=SCALE).to_pil()
    image_width, image_height = image.size
    scale_x = image_width / page_width
    scale_y = image_height / page_height

    row_fields: list[dict] = []
    for row_key in ROW_KEYS:
        rows = meta["fields"].get(row_key)
        if isinstance(rows, list):
            collect_fields(rows, row_fields)
            break
    if not row_fields:
        raise RuntimeError(f"{key}: no row fields found")

    field_left = min(field["x"] for field in row_fields)
    field_right = max(field["x"] + field["width"] for field in row_fields)
    field_bottom = min(field["y"] for field in row_fields)
    field_top = max(field["y"] + field["height"] for field in row_fields)

    horizontal_px = detect_horizontal_lines(image)
    if len(horizontal_px) < 2:
        raise RuntimeError(f"{key}: not enough horizontal rules detected")

    top_px = min(horizontal_px)
    bottom_px = max(horizontal_px)
    vertical_px = detect_vertical_lines(image, top_px, bottom_px)
    if len(vertical_px) < 2:
        raise RuntimeError(f"{key}: not enough vertical rules detected")

    horizontal_pdf = [page_height - y / scale_y for y in horizontal_px]
    vertical_pdf = [x / scale_x for x in vertical_px]

    # The outer vertical rules bound the main table; pair them with the row
    # fields' outer edges. Do not use nearest-line matching here: a merged
    # column (e.g. the travel lodging amount) can be closer to an interior rule.
    actual_left = min(vertical_pdf)
    actual_right = max(vertical_pdf)
    actual_bottom = nearest(horizontal_pdf, field_bottom, ANCHOR_TOLERANCE)
    actual_top = nearest(horizontal_pdf, field_top, ANCHOR_TOLERANCE)
    if None in (actual_left, actual_right, actual_bottom, actual_top):
        raise RuntimeError(
            f"{key}: could not anchor rules "
            f"(left={actual_left}, right={actual_right}, "
            f"bottom={actual_bottom}, top={actual_top})"
        )

    scale_x_transform, offset_x = affine(
        field_left, field_right, actual_left, actual_right
    )
    scale_y_transform, offset_y = affine(
        field_bottom, field_top, actual_bottom, actual_top
    )

    if not (0.9 <= scale_x_transform <= 1.2):
        raise RuntimeError(f"{key}: implausible x scale {scale_x_transform}")
    if not (0.9 <= scale_y_transform <= 1.2):
        raise RuntimeError(f"{key}: implausible y scale {scale_y_transform}")

    all_fields: list[dict] = []
    collect_fields(meta["fields"], all_fields)
    for field in all_fields:
        field["x"] = round(offset_x + scale_x_transform * field["x"], 2)
        field["width"] = round(scale_x_transform * field["width"], 2)
        field["y"] = round(offset_y + scale_y_transform * field["y"], 2)
        field["height"] = round(scale_y_transform * field["height"], 2)

    meta["pageWidth"] = round(page_width, 2)
    meta["pageHeight"] = round(page_height, 2)
    return (
        len(all_fields),
        (scale_x_transform, offset_x),
        (scale_y_transform, offset_y),
    )


def main() -> int:
    fields = json.loads(FIELDS_PATH.read_text(encoding="utf-8"))
    for key, meta in fields.items():
        changed, transform_x, transform_y = calibrate_form(key, meta)
        print(
            f"{key}: {changed} fields; "
            f"x = {transform_x[1]:+.2f} + {transform_x[0]:.4f} * field; "
            f"y = {transform_y[1]:+.2f} + {transform_y[0]:.4f} * field"
        )

    FIELDS_PATH.write_text(
        json.dumps(fields, ensure_ascii=False, indent=2) + "\n",
        encoding="utf-8",
    )
    print(f"Updated {FIELDS_PATH}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
