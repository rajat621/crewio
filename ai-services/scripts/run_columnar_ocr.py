from __future__ import annotations

import json
import sys
from pathlib import Path

from PIL import Image

from pipeline.columnar_ocr import run_columnar_ocr


def main(argv: list[str]) -> int:
    if len(argv) < 2:
        print("Usage: python run_columnar_ocr.py <image-or-pdf-path>")
        return 2
    p = Path(argv[1])
    if not p.exists():
        print("Path not found:", p)
        return 2

    # For simplicity, support single-page image inputs; for PDFs user should pre-render page to image
    img = Image.open(p)
    diag = run_columnar_ocr(img, image_path=str(p))
    out = Path("temp/columnar_ocr_diagnostics.json")
    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_text(json.dumps(diag, indent=2, ensure_ascii=False))
    print("Wrote diagnostics to", out)
    return 0


if __name__ == "__main__":
    raise SystemExit(main(sys.argv))
