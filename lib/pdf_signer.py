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


def _stamp_client_on_last_page_bottom(page, page_rect, signature_path, name, date_str):
    """
    Place client signature + labels only in the bottom margin of the page.
    Do not search the document for the word 'Date' (that matches body text like 'date of signing').
    """
    margin_x = 50
    margin_bottom = 48
    line_h = 15
    r = page_rect

    y = r.y1 - margin_bottom
    page.insert_text(
        fitz.Point(margin_x, y),
        f"Date: {date_str}",
        fontsize=10,
        fontname="helv",
        color=(0, 0, 0),
        overlay=True,
    )
    y -= line_h
    page.insert_text(
        fitz.Point(margin_x, y),
        f"Printed Name: {name}",
        fontsize=10,
        fontname="helv",
        color=(0, 0, 0),
        overlay=True,
    )
    y -= 10

    sig_pix = fitz.Pixmap(signature_path)
    sw, sh = sig_pix.width, sig_pix.height
    sig_pix = None
    if sw <= 0 or sh <= 0:
        raise RuntimeError("Invalid signature image dimensions")

    max_w = min(200, r.width - 2 * margin_x)
    ratio = sh / sw
    h = max(36, min(80, max_w * ratio))
    y_top = y - h - 4
    if y_top < 80:
        raise RuntimeError("Not enough room at bottom of page for signature; use a page with space or a shorter document.")
    sig_box = fitz.Rect(margin_x, y_top, margin_x + max_w, y_top + h)
    page.insert_image(sig_box, filename=signature_path, keep_proportion=True, overlay=True)

    y_label = y_top - 6
    page.insert_text(
        fitz.Point(margin_x, y_label - 2),
        "Client Signature:",
        fontsize=10,
        fontname="helv",
        color=(0, 0, 0),
        overlay=True,
    )
    y_head = y_label - 18
    page.insert_text(
        fitz.Point(margin_x, y_head),
        "Client Acceptance and Signature",
        fontsize=11,
        fontname="helv",
        color=(0, 0, 0),
        overlay=True,
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

    doc = fitz.open(args.input)
    if doc.page_count == 0:
        raise RuntimeError("Input PDF has no pages")

    # Always sign at the bottom of the LAST page only — never search for "Date" in body text
    # (that incorrectly matched phrases like "date of signing" in clause 2).
    last_idx = doc.page_count - 1
    page = doc[last_idx]
    page_rect = page.rect

    try:
        _stamp_client_on_last_page_bottom(page, page_rect, args.signature, args.name, args.date)
    except RuntimeError:
        # Not enough room: append a new page and stamp there.
        page = doc.new_page(width=page_rect.width, height=page_rect.height)
        _stamp_client_on_last_page_bottom(page, page.rect, args.signature, args.name, args.date)

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
