import argparse
import os
import sys

import fitz  # PyMuPDF
from PIL import Image


def _pick_best_rect(doc, needles):
    best = None  # (page_index, y0, rect)
    for i, page in enumerate(doc):
        for needle in needles:
            for rect in page.search_for(needle):
                cand = (i, rect.y0, rect)
                if best is None or cand[0] > best[0] or (cand[0] == best[0] and cand[1] > best[1]):
                    best = cand
    return best


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--input", required=True)
    parser.add_argument("--output", required=True)
    parser.add_argument("--signature", required=True)
    parser.add_argument("--name", required=True)
    parser.add_argument("--date", required=True)
    args = parser.parse_args()

    if not os.path.exists(args.input):
        raise FileNotFoundError(f"Input PDF not found: {args.input}")
    if not os.path.exists(args.signature):
        raise FileNotFoundError(f"Signature image not found: {args.signature}")

    with Image.open(args.signature) as im:
        sw, sh = im.size
    if sw <= 0 or sh <= 0:
        raise RuntimeError("Invalid signature image dimensions")

    doc = fitz.open(args.input)
    if doc.page_count == 0:
        raise RuntimeError("Input PDF has no pages")

    sig_best = _pick_best_rect(doc, ["Client Signature", "Signature", "Authorized Signature"])
    date_best = _pick_best_rect(doc, ["Date", "Signed Date"])
    name_best = _pick_best_rect(doc, ["Printed Name", "Full Name", "Name"])

    sig_page_idx = sig_best[0] if sig_best else doc.page_count - 1
    page = doc[sig_page_idx]
    page_rect = page.rect

    if sig_best:
        sig_rect = sig_best[2]
        x = min(sig_rect.x1 + 10, page_rect.width - 200)
        y = max(40, sig_rect.y0 - 6)
    else:
        x = page_rect.width * 0.55
        y = page_rect.height * 0.82

    max_w = min(190, page_rect.width - x - 20)
    max_w = max(120, max_w)
    ratio = sh / sw
    h = max(36, min(72, max_w * ratio))
    sig_box = fitz.Rect(x, y, x + max_w, y + h)
    if sig_box.y1 > page_rect.height - 20:
        overflow = sig_box.y1 - (page_rect.height - 20)
        sig_box = fitz.Rect(sig_box.x0, sig_box.y0 - overflow, sig_box.x1, sig_box.y1 - overflow)

    page.insert_image(sig_box, filename=args.signature, keep_proportion=True, overlay=True)

    # Printed name placement
    if name_best:
        npage = doc[name_best[0]]
        nr = name_best[2]
        npt = fitz.Point(min(nr.x1 + 8, npage.rect.width - 200), nr.y1 - 1)
        npage.insert_text(npt, args.name, fontsize=10, color=(0, 0, 0), overlay=True)
    else:
        npt = fitz.Point(sig_box.x0, min(page_rect.height - 40, sig_box.y1 + 18))
        page.insert_text(npt, f"Printed Name: {args.name}", fontsize=10, color=(0, 0, 0), overlay=True)

    # Date placement
    if date_best:
        dpage = doc[date_best[0]]
        dr = date_best[2]
        dpt = fitz.Point(min(dr.x1 + 8, dpage.rect.width - 200), dr.y1 - 1)
        dpage.insert_text(dpt, args.date, fontsize=10, color=(0, 0, 0), overlay=True)
    else:
        dpt = fitz.Point(sig_box.x0, min(page_rect.height - 24, sig_box.y1 + 34))
        page.insert_text(dpt, f"Date: {args.date}", fontsize=10, color=(0, 0, 0), overlay=True)

    if os.path.exists(args.output):
        os.remove(args.output)
    doc.save(args.output, garbage=4, deflate=True)
    doc.close()


if __name__ == "__main__":
    try:
        main()
    except Exception as exc:
        print(str(exc), file=sys.stderr)
        sys.exit(1)
