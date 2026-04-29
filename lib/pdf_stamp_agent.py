"""
Append Agency (LAB007) signature block on a new page at the end of a PDF.
Keeps all existing pages unchanged so body text is never overlapped.
"""
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
    try:
        user_site = site.getusersitepackages()
        if user_site and user_site not in sys.path:
            sys.path.append(user_site)
        import fitz as _fitz  # type: ignore
        return _fitz
    except Exception:
        pass
    subprocess.run([sys.executable, "-m", "ensurepip", "--upgrade"], capture_output=True, text=True)
    install = subprocess.run(
        [sys.executable, "-m", "pip", "install", "--user", "pymupdf"],
        capture_output=True,
        text=True,
    )
    if install.returncode != 0:
        raise ModuleNotFoundError("pymupdf required")
    user_site = site.getusersitepackages()
    if user_site and user_site not in sys.path:
        sys.path.append(user_site)
    import fitz as _fitz  # type: ignore
    return _fitz


fitz = _ensure_fitz()


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--input", required=True)
    parser.add_argument("--output", required=True)
    parser.add_argument("--signature", required=True)
    parser.add_argument("--date", required=True)
    args = parser.parse_args()

    if not os.path.exists(args.input):
        raise FileNotFoundError(f"Input PDF not found: {args.input}")
    if not os.path.exists(args.signature):
        raise FileNotFoundError(f"Signature image not found: {args.signature}")

    doc = fitz.open(args.input)
    if doc.page_count == 0:
        raise RuntimeError("Input PDF has no pages")

    # New page at end — match source document page size (avoids inconsistent print boxes).
    ref = doc[-1].rect
    page = doc.new_page(width=ref.width, height=ref.height)
    r = page.rect
    margin_x = 50
    y = 72

    page.insert_text(
        fitz.Point(margin_x, y),
        "Agency representative (LAB007)",
        fontsize=12,
        fontname="helv",
        color=(0, 0, 0),
    )
    y += 22
    page.insert_text(
        fitz.Point(margin_x, y),
        f"Date (document issued): {args.date}",
        fontsize=10,
        fontname="helv",
        color=(0, 0, 0),
    )
    y += 20
    page.insert_text(
        fitz.Point(margin_x, y),
        "Agent Signature:",
        fontsize=10,
        fontname="helv",
        color=(0, 0, 0),
    )
    y += 16

    sig_pix = fitz.Pixmap(args.signature)
    sw, sh = sig_pix.width, sig_pix.height
    sig_pix = None
    if sw <= 0 or sh <= 0:
        raise RuntimeError("Invalid signature image dimensions")

    max_w = min(220, r.width - 2 * margin_x)
    ratio = sh / sw
    h = max(40, min(90, max_w * ratio))
    sig_box = fitz.Rect(margin_x, y, margin_x + max_w, y + h)
    page.insert_image(sig_box, filename=args.signature, keep_proportion=True)

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
