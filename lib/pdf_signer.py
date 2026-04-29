import argparse
import os
import site
import subprocess
import sys

def _ensure_fitz():
    try:
        import fitz as _fitz  # type: ignore
        return _fitz
    except ModuleNotFoundError:
        pass

    # Make user site-packages importable even when PYTHONNOUSERSITE is set.
    try:
        user_site = site.getusersitepackages()
        if user_site and user_site not in sys.path:
            sys.path.append(user_site)
        import fitz as _fitz  # type: ignore
        return _fitz
    except Exception:
        pass

    # Last resort: install PyMuPDF at runtime for this interpreter.
    subprocess.run([sys.executable, "-m", "ensurepip", "--upgrade"], capture_output=True, text=True)
    install = subprocess.run(
        [sys.executable, "-m", "pip", "install", "--user", "pymupdf"],
        capture_output=True,
        text=True,
    )
    if install.returncode != 0:
        raise ModuleNotFoundError(
            "No module named 'fitz' and failed to install pymupdf: "
            + (install.stderr or install.stdout or "unknown pip error")
        )

    user_site = site.getusersitepackages()
    if user_site and user_site not in sys.path:
        sys.path.append(user_site)

    import fitz as _fitz  # type: ignore
    return _fitz


fitz = _ensure_fitz()  # PyMuPDF


def _pick_best_rect(doc, needles):
    best = None  # (page_index, y0, rect)
    for i, page in enumerate(doc):
        for needle in needles:
            for rect in page.search_for(needle):
                cand = (i, rect.y0, rect)
                if best is None or cand[0] > best[0] or (cand[0] == best[0] and cand[1] > best[1]):
                    best = cand
    return best


def _pick_section_anchor(doc):
    # Prefer explicit signature section headings on later pages.
    return _pick_best_rect(
        doc,
        [
            "Client Acceptance & Signature",
            "Client Acceptanace and Signature",
            "Client Acceptanace & Signature",
            "Client Acceptance and Signature",
            "Acceptance & Signature",
            "Acceptance and Signature",
        ],
    )


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

    sig_pix = fitz.Pixmap(args.signature)
    sw, sh = sig_pix.width, sig_pix.height
    sig_pix = None
    if sw <= 0 or sh <= 0:
        raise RuntimeError("Invalid signature image dimensions")

    doc = fitz.open(args.input)
    if doc.page_count == 0:
        raise RuntimeError("Input PDF has no pages")

    section_best = _pick_section_anchor(doc)
    sig_best = _pick_best_rect(doc, ["Client Signature", "Signature", "Authorized Signature"])
    date_best = _pick_best_rect(doc, ["Date", "Signed Date"])
    name_best = _pick_best_rect(doc, ["Printed Name", "Full Name", "Name"])

    sig_page_idx = (
        sig_best[0]
        if sig_best
        else (section_best[0] if section_best else doc.page_count - 1)
    )
    page = doc[sig_page_idx]
    page_rect = page.rect

    if sig_best:
        sig_rect = sig_best[2]
        # Keep signature left-justified near the signature field value area.
        x = min(max(sig_rect.x1 + 8, 150), page_rect.width - 220)
        y = max(40, sig_rect.y0 - 8)
    elif section_best and section_best[0] == sig_page_idx:
        anchor = section_best[2]
        x = min(max(anchor.x0 + 10, 60), page_rect.width - 220)
        y = min(max(anchor.y1 + 96, 40), page_rect.height - 140)
    else:
        x = max(90, page_rect.width * 0.18)
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

    # Always stamp a visible section header/labels near the signature area so users
    # can clearly see the signed block even when source PDFs have inconsistent fields.
    heading_y = sig_box.y0 - 26
    if heading_y < 20:
        heading_y = min(page_rect.height - 64, sig_box.y1 + 12)
    page.insert_text(
        fitz.Point(sig_box.x0, heading_y),
        "Client Acceptance and Signature",
        fontsize=11,
        fontname="helv",
        color=(0, 0, 0),
        overlay=True,
    )
    sig_label_y = max(24, sig_box.y0 - 8)
    page.insert_text(
        fitz.Point(sig_box.x0, sig_label_y),
        "Client Signature:",
        fontsize=10,
        color=(0, 0, 0),
        overlay=True,
    )

    # Printed name placement: prefer a field on the same page as signature.
    if name_best and name_best[0] == sig_page_idx:
        npage = doc[name_best[0]]
        nr = name_best[2]
        npt = fitz.Point(min(max(nr.x1 + 8, 150), npage.rect.width - 200), nr.y1 - 1)
        npage.insert_text(npt, args.name, fontsize=10, color=(0, 0, 0), overlay=True)
    else:
        npt = fitz.Point(sig_box.x0, min(page_rect.height - 40, sig_box.y1 + 18))
        page.insert_text(npt, f"Printed Name: {args.name}", fontsize=10, color=(0, 0, 0), overlay=True)

    # Date placement: prefer a field on the same page as signature.
    if date_best and date_best[0] == sig_page_idx:
        dpage = doc[date_best[0]]
        dr = date_best[2]
        dpt = fitz.Point(min(max(dr.x1 + 8, 150), dpage.rect.width - 200), dr.y1 - 1)
        dpage.insert_text(dpt, args.date, fontsize=10, color=(0, 0, 0), overlay=True)
    else:
        dpt = fitz.Point(sig_box.x0, min(page_rect.height - 24, sig_box.y1 + 34))
        page.insert_text(dpt, f"Date: {args.date}", fontsize=10, color=(0, 0, 0), overlay=True)

    # Always include explicit signer/date lines immediately below the signature image.
    # This guarantees visibility even if matched fields were elsewhere on the page.
    footer_name_y = min(page_rect.height - 36, sig_box.y1 + 18)
    footer_date_y = min(page_rect.height - 20, footer_name_y + 16)
    page.insert_text(
        fitz.Point(sig_box.x0, footer_name_y),
        f"Printed Name: {args.name}",
        fontsize=10,
        color=(0, 0, 0),
        overlay=True,
    )
    page.insert_text(
        fitz.Point(sig_box.x0, footer_date_y),
        f"Date: {args.date}",
        fontsize=10,
        color=(0, 0, 0),
        overlay=True,
    )

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
