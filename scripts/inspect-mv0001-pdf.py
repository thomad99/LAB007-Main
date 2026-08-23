import fitz
import sys

pdf_path = sys.argv[1] if len(sys.argv) > 1 else r"C:\Users\tomo\OneDrive\Elite Cleaning\MV0001.pdf"
doc = fitz.open(pdf_path)
page = doc[0]
print("Page size:", page.rect)
print("Images:", len(page.get_images()))
for i, img in enumerate(page.get_images()):
    xref = img[0]
    info = doc.extract_image(xref)
    out = f"scripts/mv0001-img-{i}.{info['ext']}"
    with open(out, "wb") as f:
        f.write(info["image"])
    print(f"  img {i}: {info['width']}x{info['height']} {info['ext']} -> {out}")

blocks = page.get_text("dict")["blocks"]
for b in blocks:
    if b.get("type") == 0:
        for line in b.get("lines", []):
            for span in line.get("spans", []):
                t = span["text"].strip()
                if t:
                    c = span["color"]
                    print(
                        f"{span['bbox']} font={span['font']} size={span['size']:.1f} "
                        f"color=#{c:06x} flags={span['flags']} '{t}'"
                    )

page.get_pixmap(matrix=fitz.Matrix(2, 2)).save("scripts/mv0001-preview.png")
print("Saved scripts/mv0001-preview.png")
doc.close()
