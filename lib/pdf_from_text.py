import argparse
import textwrap

import fitz  # PyMuPDF


def wrap_paragraphs(text, width=95):
    out = []
    for raw in (text or "").splitlines():
        line = raw.rstrip()
        if not line:
            out.append("")
            continue
        out.extend(textwrap.wrap(line, width=width) or [""])
    return out


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--output", required=True)
    parser.add_argument("--title", required=True)
    parser.add_argument("--body", required=True)
    args = parser.parse_args()

    lines = [args.title, ""] + wrap_paragraphs(args.body, width=95)
    doc = fitz.open()

    page_w, page_h = 612, 792  # US Letter
    margin = 50
    line_h = 15
    usable_h = page_h - (margin * 2)
    max_lines = int(usable_h // line_h)
    idx = 0
    while idx < len(lines):
      page = doc.new_page(width=page_w, height=page_h)
      y = margin
      for _ in range(max_lines):
          if idx >= len(lines):
              break
          txt = lines[idx]
          page.insert_text((margin, y), txt, fontsize=11, color=(0, 0, 0))
          y += line_h
          idx += 1

    doc.save(args.output, garbage=4, deflate=True)
    doc.close()


if __name__ == "__main__":
    main()
