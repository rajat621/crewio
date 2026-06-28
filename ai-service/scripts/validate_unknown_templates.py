"""Real-world unknown-template robustness validation suite.

Scope:
- Generates unseen/stressed variants from local UAE labour timesheets.
- Runs extraction pipeline without manual tuning.
- Produces failure analysis JSON for failed cases.
- Computes benchmark metrics and production readiness report.
- Exports side-by-side previews (timesheet vs generated invoice).

Usage:
python scripts/validate_unknown_templates.py
python scripts/validate_unknown_templates.py --max-sources 10 --outdir storage/debug/unknown_template_validation
"""

from __future__ import annotations

import argparse
import json
import random
import sys
import uuid
from pathlib import Path
from statistics import mean
from typing import Any, Dict, List, Optional, Sequence, Tuple

from PIL import Image, ImageDraw
from pdf2image import convert_from_path


_HERE = Path(__file__).resolve()
_SERVICE_ROOT = _HERE.parents[1]
if str(_SERVICE_ROOT) not in sys.path:
    sys.path.insert(0, str(_SERVICE_ROOT))

from schema import CompanyProfile
from validation import score_extraction_details
from pipeline.classifier import classify_pdf
from pipeline.run import run_extraction
from generator import generate_invoice_pdf


RANDOM_SEED = 42


def _find_poppler_path() -> Optional[str]:
    candidates = [
        Path("C:/Program Files/poppler/Library/bin"),
        Path("C:/Program Files/poppler/bin"),
    ]
    local_base = Path.home() / "AppData/Local/Microsoft/WinGet/Packages"
    if local_base.exists():
        for folder in local_base.iterdir():
            if "poppler" not in folder.name.lower():
                continue
            for path in folder.rglob("pdfinfo.exe"):
                return str(path.parent)
    for candidate in candidates:
        if (candidate / "pdfinfo.exe").exists():
            return str(candidate)
    return None


def _convert_pdf_to_images(pdf_path: Path, dpi: int = 220) -> List[Image.Image]:
    kwargs: Dict[str, Any] = {"dpi": dpi}
    poppler = _find_poppler_path()
    if poppler:
        kwargs["poppler_path"] = poppler

    images = convert_from_path(str(pdf_path), **kwargs)
    return [img.convert("RGB") for img in images]


def _shift_image(img: Image.Image, x_shift: int, y_shift: int) -> Image.Image:
    bg = Image.new("RGB", img.size, "white")
    bg.paste(img, (x_shift, y_shift))
    return bg


def _resize_canvas(img: Image.Image, scale: float) -> Image.Image:
    w, h = img.size
    nw, nh = max(1, int(w * scale)), max(1, int(h * scale))
    resized = img.resize((nw, nh), Image.Resampling.BICUBIC)
    canvas = Image.new("RGB", (w, h), "white")
    x = max(0, (w - nw) // 2)
    y = max(0, (h - nh) // 2)
    canvas.paste(resized, (x, y))
    return canvas


def _add_noise(img: Image.Image, strength: int = 18) -> Image.Image:
    import numpy as np

    arr = np.array(img).astype("int16")
    noise = np.random.default_rng(RANDOM_SEED).integers(-strength, strength + 1, size=arr.shape)
    noisy = (arr + noise).clip(0, 255).astype("uint8")
    return Image.fromarray(noisy, mode="RGB")


def _low_dpi_roundtrip(img: Image.Image) -> Image.Image:
    w, h = img.size
    down = img.resize((max(1, w // 2), max(1, h // 2)), Image.Resampling.BILINEAR)
    return down.resize((w, h), Image.Resampling.BILINEAR)


def _add_watermark(img: Image.Image, text: str = "CONFIDENTIAL UAE LABOUR COPY") -> Image.Image:
    wm = img.copy().convert("RGBA")
    overlay = Image.new("RGBA", wm.size, (255, 255, 255, 0))
    draw = ImageDraw.Draw(overlay)
    w, h = wm.size

    for y in range(0, h, max(120, h // 10)):
        for x in range(-200, w, max(280, w // 4)):
            draw.text((x, y), text, fill=(140, 140, 140, 80))

    return Image.alpha_composite(wm, overlay).convert("RGB")


def _alter_branding(img: Image.Image) -> Image.Image:
    out = img.copy()
    draw = ImageDraw.Draw(out)
    w, h = out.size
    draw.rectangle([(0, 0), (w, int(h * 0.12))], fill=(245, 248, 255))
    draw.rectangle([(int(w * 0.02), int(h * 0.02)), (int(w * 0.35), int(h * 0.09))], outline=(20, 50, 120), width=3)
    draw.text((int(w * 0.03), int(h * 0.035)), "ALT CONTRACTOR BRAND", fill=(20, 50, 120))
    return out


def _alter_footer(img: Image.Image) -> Image.Image:
    out = img.copy()
    draw = ImageDraw.Draw(out)
    w, h = out.size
    y0 = int(h * 0.83)
    draw.rectangle([(0, y0), (w, h)], fill=(255, 255, 255))
    draw.text((int(w * 0.05), int(h * 0.87)), "Net Amount Payable AED", fill=(0, 0, 0))
    draw.text((int(w * 0.68), int(h * 0.87)), "0.00", fill=(0, 0, 0))
    return out


def _transform_pages(images: Sequence[Image.Image], variant: str) -> List[Image.Image]:
    transformed: List[Image.Image] = []

    for img in images:
        out = img
        if variant == "shifted_table":
            out = _shift_image(out, x_shift=18, y_shift=8)
        elif variant == "resized_layout":
            out = _resize_canvas(out, scale=0.9)
        elif variant == "skewed_scan":
            out = out.rotate(3.2, expand=False, fillcolor="white")
        elif variant == "noisy_scan":
            out = _add_noise(out, strength=20)
        elif variant == "low_dpi_scan":
            out = _low_dpi_roundtrip(out)
        elif variant == "watermark_heavy":
            out = _add_watermark(out)
        elif variant == "altered_branding":
            out = _alter_branding(out)
        elif variant == "altered_footer":
            out = _alter_footer(out)

        transformed.append(out)

    return transformed


def _save_pdf(images: Sequence[Image.Image], output_path: Path) -> Path:
    output_path.parent.mkdir(parents=True, exist_ok=True)
    first = images[0]
    rest = list(images[1:])
    first.save(str(output_path), "PDF", save_all=True, append_images=rest)
    return output_path


def _discover_sources(repo_root: Path, max_sources: int) -> List[Path]:
    preferred = [
        repo_root / "time_sheet.pdf",
        repo_root / "timesheet2.pdf",
        repo_root / "mcc_timesheet.pdf",
        repo_root / "INVOICE BKC OCT.pdf",
        repo_root / "Invoice 8 (1).pdf",
    ]

    found: List[Path] = [p for p in preferred if p.exists()]

    uploads = repo_root / "backend" / "src" / "storage" / "uploads" / "timesheets"
    if uploads.exists():
        candidates = sorted([p for p in uploads.glob("*.pdf") if p.is_file()])
        for p in candidates:
            if p not in found:
                found.append(p)
            if len(found) >= max_sources:
                break

    return found[:max_sources]


def _case_id(source: Path, variant: str) -> str:
    return f"{source.stem}-{variant}".replace(" ", "_").lower()


def _missing_fields(payload: Dict[str, Any]) -> List[str]:
    missing: List[str] = []
    if payload.get("rows", 0) <= 0:
        missing.append("rows")
    if float(payload.get("subtotal", 0.0) or 0.0) <= 0.0:
        missing.append("subtotal")
    if float(payload.get("vat", 0.0) or 0.0) <= 0.0:
        missing.append("vat")
    if float(payload.get("net_payable", 0.0) or 0.0) <= 0.0:
        missing.append("net_payable")
    if payload.get("deduction_source") in {"", "none", None}:
        missing.append("deduction_source")
    return missing


def _failed_stage(payload: Dict[str, Any]) -> str:
    if payload.get("rows", 0) <= 0:
        return "row_extraction"
    if "ocr_unreadable" in str(payload.get("error", "")):
        return "ocr_parsing"
    if float(payload.get("subtotal", 0.0) or 0.0) <= 0.0:
        return "financial_block_parsing"
    if float(payload.get("net_payable", 0.0) or 0.0) <= 0.0:
        return "financial_reconciliation"
    return "post_validation"


def _failure_reason(payload: Dict[str, Any]) -> str:
    if payload.get("error"):
        return str(payload["error"])
    miss = _missing_fields(payload)
    if miss:
        return "missing:" + ",".join(miss)
    return "low_confidence_or_inconsistent"


def _project_visibility(rows: Sequence[Any], layout: str) -> float:
    if not rows:
        return 0.0
    if layout != "project_based":
        return 1.0
    visible = sum(1 for r in rows if getattr(r, "project_id", None))
    return round(visible / len(rows), 4)


def _safe_metric(actual: float, expected: float) -> float:
    if expected <= 0.0:
        return 1.0 if actual <= 0.01 else 0.0
    return max(0.0, min(1.0, 1.0 - (abs(actual - expected) / max(expected, 1.0))))


def _render_side_by_side(
    source_pdf: Path,
    invoice_pdf: Optional[Path],
    out_path: Path,
    label: str,
) -> None:
    ts_img = _convert_pdf_to_images(source_pdf, dpi=160)[0]

    if invoice_pdf and invoice_pdf.exists():
        inv_img = _convert_pdf_to_images(invoice_pdf, dpi=160)[0]
    else:
        inv_img = Image.new("RGB", ts_img.size, "white")
        draw = ImageDraw.Draw(inv_img)
        draw.text((30, 30), "Invoice not generated", fill=(200, 0, 0))

    h = max(ts_img.height, inv_img.height)
    w = ts_img.width + inv_img.width
    canvas = Image.new("RGB", (w, h + 40), "white")
    canvas.paste(ts_img, (0, 40))
    canvas.paste(inv_img, (ts_img.width, 40))

    draw = ImageDraw.Draw(canvas)
    draw.rectangle([(0, 0), (w, 40)], fill=(235, 240, 248))
    draw.text((12, 12), f"{label} | left=timesheet right=invoice", fill=(0, 0, 0))

    out_path.parent.mkdir(parents=True, exist_ok=True)
    canvas.save(out_path)


def _build_company_profile() -> CompanyProfile:
    return CompanyProfile(
        name="Unknown Template Validation Company",
        trn="100000000000003",
        vat_rate=0.05,
        invoice_number="VAL-UNKNOWN-001",
        invoice_date="13/05/2026",
        mobile="+971500000000",
        email="validation@crewcontrol.local",
        website="crewcontrol.local",
        address="Dubai, UAE",
    )


def run_validation(
    repo_root: Path,
    outdir: Path,
    max_sources: int = 8,
    max_variants: Optional[int] = None,
    source_dpi: int = 180,
    variant_names: Optional[List[str]] = None,
) -> Dict[str, Any]:
    random.seed(RANDOM_SEED)

    dataset_dir = outdir / "generated_dataset"
    results_dir = outdir / "results"
    preview_success = outdir / "previews" / "successful"
    preview_failed = outdir / "previews" / "failed"
    preview_low = outdir / "previews" / "low_confidence"
    failure_dir = repo_root / "ai-service" / "storage" / "debug" / "failure_analysis"

    for d in [dataset_dir, results_dir, preview_success, preview_failed, preview_low, failure_dir]:
        d.mkdir(parents=True, exist_ok=True)

    sources = _discover_sources(repo_root, max_sources=max_sources)
    if not sources:
        raise RuntimeError("No source PDFs found for unknown-template validation")

    variants = [
        "baseline_unknown",
        "shifted_table",
        "resized_layout",
        "skewed_scan",
        "noisy_scan",
        "low_dpi_scan",
        "watermark_heavy",
        "altered_branding",
        "altered_footer",
    ]
    if variant_names:
        wanted = {name.strip() for name in variant_names if name.strip()}
        variants = [variant for variant in variants if variant in wanted]
    if max_variants is not None:
        variants = variants[: max(1, int(max_variants))]

    profile = _build_company_profile()

    case_results: List[Dict[str, Any]] = []
    by_source_baseline: Dict[str, Dict[str, float]] = {}

    # Baseline pass for expected values per source.
    print(f"[validation] sources={len(sources)} variants={len(variants)}", flush=True)

    for source in sources:
        print(f"[validation] baseline {source.name}", flush=True)
        fmt, layout, _ = classify_pdf(str(source))
        base_result = run_extraction(pdf_path=str(source), company_profile=profile, debug_mode=True, run_id=str(uuid.uuid4()))
        by_source_baseline[str(source)] = {
            "subtotal": float(base_result.financials.subtotal or 0.0),
            "deduction": float(base_result.financials.total_deduction or 0.0),
            "vat": float(base_result.financials.total_vat or 0.0),
            "rows": float(len(base_result.rows)),
        }

    for source in sources:
        src_images = _convert_pdf_to_images(source, dpi=source_dpi)

        for variant in variants:
            print(f"[validation] case {source.stem}::{variant}", flush=True)
            case_name = _case_id(source, variant)
            case_pdf = dataset_dir / f"{case_name}.pdf"

            if variant == "baseline_unknown":
                _save_pdf(src_images, case_pdf)
            else:
                transformed = _transform_pages(src_images, variant=variant)
                _save_pdf(transformed, case_pdf)

            fmt, layout, _ = classify_pdf(str(case_pdf))
            run_id = str(uuid.uuid4())
            result = run_extraction(
                pdf_path=str(case_pdf),
                company_profile=profile,
                debug_mode=True,
                run_id=run_id,
            )

            confidence_details = score_extraction_details(result)
            components = confidence_details.get("components", {})
            score = float(confidence_details.get("score", 0.0))

            baseline = by_source_baseline[str(source)]
            deduction_acc = _safe_metric(float(result.financials.total_deduction or 0.0), baseline["deduction"])
            vat_acc = _safe_metric(float(result.financials.total_vat or 0.0), baseline["vat"])
            subtotal_acc = _safe_metric(float(result.financials.subtotal or 0.0), baseline["subtotal"])
            footer_acc = 1.0 if str(result.financials.deduction_source or "") not in {"", "none"} else 0.0
            project_vis = _project_visibility(result.rows, layout.value)

            invoice_path: Optional[Path] = None
            invoice_success = False
            try:
                if result.rows:
                    invoice_pdf = generate_invoice_pdf(
                        output_dir=str(results_dir),
                        result=result,
                        profile=profile,
                        include_signature=False,
                        include_stamp=False,
                        run_id=run_id,
                        source_pdf_path=str(case_pdf),
                    )
                    invoice_path = Path(invoice_pdf)
                    invoice_success = invoice_path.exists()
            except Exception:
                invoice_success = False

            payload = {
                "case_id": case_name,
                "source_pdf": str(source),
                "variant_pdf": str(case_pdf),
                "variant": variant,
                "format": fmt.value,
                "layout": layout.value,
                "success": bool(result.success),
                "rows": len(result.rows),
                "subtotal": float(result.financials.subtotal or 0.0),
                "deduction": float(result.financials.total_deduction or 0.0),
                "vat": float(result.financials.total_vat or 0.0),
                "net_payable": float(result.financials.net_payable or 0.0),
                "deduction_source": str(result.financials.deduction_source or "none"),
                "confidence": float(result.confidence or 0.0),
                "document_confidence": score,
                "confidence_breakdown": components,
                "warnings": [str(w) for w in result.warnings],
                "error": result.error,
                "processing_time_ms": int(result.processing_time_ms or 0),
                "metrics": {
                    "deduction_accuracy": round(deduction_acc, 4),
                    "vat_accuracy": round(vat_acc, 4),
                    "subtotal_accuracy": round(subtotal_acc, 4),
                    "footer_parsing_accuracy": round(footer_acc, 4),
                    "projectno_visibility_correctness": round(project_vis, 4),
                    "invoice_generation_success": 1.0 if invoice_success else 0.0,
                },
            }

            is_low_conf = score < 0.7
            is_fail = not bool(result.success)

            preview_target = preview_success / f"{case_name}.png"
            if is_fail:
                preview_target = preview_failed / f"{case_name}.png"
            elif is_low_conf:
                preview_target = preview_low / f"{case_name}.png"

            _render_side_by_side(case_pdf, invoice_path, preview_target, label=case_name)
            payload["preview_png"] = str(preview_target)

            if is_fail:
                analysis = {
                    "case_id": case_name,
                    "failure_reason": _failure_reason(payload),
                    "failed_stage": _failed_stage(payload),
                    "confidence_breakdown": components,
                    "ocr_quality_score": round(float(components.get("ocr_confidence", payload["confidence"])), 4),
                    "missing_fields": _missing_fields(payload),
                    "table_classification_summary": {
                        "format": fmt.value,
                        "layout": layout.value,
                        "rows_detected": len(result.rows),
                        "warnings": [w for w in payload["warnings"] if "table" in w.lower() or "semantic" in w.lower()],
                    },
                    "source_pdf": str(source),
                    "variant_pdf": str(case_pdf),
                }
                (failure_dir / f"{case_name}.json").write_text(json.dumps(analysis, indent=2), encoding="utf-8")

            case_results.append(payload)

    total_cases = len(case_results)
    success_cases = [c for c in case_results if c["success"]]
    avg_conf = mean([c["document_confidence"] for c in case_results]) if case_results else 0.0

    deduction_scores = [c["metrics"]["deduction_accuracy"] for c in case_results]
    vat_scores = [c["metrics"]["vat_accuracy"] for c in case_results]
    subtotal_scores = [c["metrics"]["subtotal_accuracy"] for c in case_results]
    footer_scores = [c["metrics"]["footer_parsing_accuracy"] for c in case_results]
    project_scores = [c["metrics"]["projectno_visibility_correctness"] for c in case_results]
    invoice_scores = [c["metrics"]["invoice_generation_success"] for c in case_results]

    failed = [c for c in case_results if not c["success"]]
    critical_failures = sorted({str(c.get("error") or _failure_reason(c)) for c in failed})

    report = {
        "unknown_template_success_rate": round((len(success_cases) / total_cases) if total_cases else 0.0, 4),
        "financial_accuracy": round(mean(subtotal_scores) if subtotal_scores else 0.0, 4),
        "deduction_accuracy": round(mean(deduction_scores) if deduction_scores else 0.0, 4),
        "vat_accuracy": round(mean(vat_scores) if vat_scores else 0.0, 4),
        "footer_parsing_accuracy": round(mean(footer_scores) if footer_scores else 0.0, 4),
        "projectno_visibility_correctness": round(mean(project_scores) if project_scores else 0.0, 4),
        "invoice_generation_success_rate": round(mean(invoice_scores) if invoice_scores else 0.0, 4),
        "average_confidence": round(avg_conf, 4),
        "critical_failures": critical_failures,
        "total_cases": total_cases,
        "successful_cases": len(success_cases),
        "failed_cases": len(failed),
    }

    (outdir / "case_results.json").write_text(json.dumps(case_results, indent=2), encoding="utf-8")
    (outdir / "production_readiness_report.json").write_text(json.dumps(report, indent=2), encoding="utf-8")

    return report


def main() -> None:
    parser = argparse.ArgumentParser(description="Unknown-template robustness validation suite")
    parser.add_argument("--repo-root", default=".", help="Workspace root")
    parser.add_argument("--outdir", default="ai-service/storage/debug/unknown_template_validation", help="Output directory")
    parser.add_argument("--max-sources", type=int, default=8, help="Maximum source PDFs to seed variants")
    parser.add_argument("--max-variants", type=int, default=None, help="Limit the number of stress variants to run")
    parser.add_argument("--source-dpi", type=int, default=180, help="DPI used when generating stressed variant PDFs")
    parser.add_argument("--variants", default="", help="Comma-separated variant names to run")
    args = parser.parse_args()

    repo_root = Path(args.repo_root).resolve()
    outdir = (repo_root / args.outdir).resolve()
    outdir.mkdir(parents=True, exist_ok=True)

    report = run_validation(
        repo_root=repo_root,
        outdir=outdir,
        max_sources=max(1, int(args.max_sources)),
        max_variants=args.max_variants,
        source_dpi=max(72, int(args.source_dpi)),
        variant_names=[v.strip() for v in str(args.variants).split(",") if v.strip()] or None,
    )
    print(json.dumps(report, indent=2))


if __name__ == "__main__":
    main()
