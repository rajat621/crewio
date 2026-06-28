"""Vision extraction adapter that preserves the existing ExtractionResult contract."""

from __future__ import annotations

import logging
import re
import time
from pathlib import Path
from typing import Any, Dict, List, Optional

from pypdf import PdfReader

from config_runtime import CONFIG
from providers.vision_llm import get_vision_provider
from schema import ExtractionResult, InvoiceFinancials, InvoiceLayout, InvoiceRow, TimesheetFormat, TimesheetMetadata
from vision.pdf_to_image import pdf_to_images

from pipeline.structured_logging import log_event
from pipeline.text_extractor import _aggregate_primary_rows, _hard_validate_rows


logger = logging.getLogger(__name__)


_IMAGE_EXTENSIONS = {".png", ".jpg", ".jpeg", ".webp", ".bmp", ".tif", ".tiff"}


def scanned_or_image_pdf(path: str) -> bool:
    source = Path(path)
    if source.suffix.lower() in _IMAGE_EXTENSIONS:
        return True
    try:
        reader = PdfReader(path)
        text = ""
        for page in reader.pages[: max(1, int(CONFIG.resource_limits.vision_max_pages or 1))]:
            text += page.extract_text() or ""
        return len(text.strip()) < 50
    except Exception:
        return True


def vision_enabled_for(path: str) -> bool:
    if not CONFIG.feature_flags.enable_vision:
        return False
    mode = str(CONFIG.extraction.mode or "hybrid").lower()
    if mode == "deterministic_only":
        return False
    if mode == "vision_hybrid":
        return scanned_or_image_pdf(path)
    return False


def extract_using_vision(pdf_path: str, run_id: Optional[str] = None) -> ExtractionResult:
    started = time.time()
    warnings: List[str] = ["extraction_source:vision"]
    # Signal start
    try:
        log_event(logger, "VISION_EXTRACTION_STARTED", pdf_path=pdf_path, run_id=run_id or "")
    except Exception:
        pass

    try:
        images = pdf_to_images(pdf_path)
        if not images:
            raise RuntimeError("VISION_NO_IMAGES")

        max_pages = max(1, int(CONFIG.resource_limits.vision_max_pages or 1))
        if len(images) > max_pages:
            images = images[:max_pages]
            warnings.append(f"vision_pages_limited:{max_pages}")

        provider = get_vision_provider()
        raw = provider.extract_pages(images)
        # enforce required schema keys
        rows = _rows_from_payload(raw, warnings)
        rows = _aggregate_primary_rows(rows)
        rows = _hard_validate_rows(rows, warnings)

        fin = InvoiceFinancials(
            subtotal=max(0.0, _to_float(raw.get("subtotal"))),
            total_deduction=max(0.0, _to_float(raw.get("deductions"))),
            net_payable=max(0.0, _to_float(raw.get("net_total"))),
            deduction_source="vision" if _to_float(raw.get("deductions")) > 0 else "",
        )
        if fin.subtotal <= 0.0 and rows:
            fin.subtotal = round(sum(float(r.amount or 0.0) for r in rows), 2)

        # Validation rules (strict vision acceptance criteria)
            vision_reasons: List[str] = []
            employee_count = len(rows)
            vision_subtotal = round(sum(float(r.amount or 0.0) for r in rows), 2) if rows else 0.0
            summary_subtotal = float(fin.subtotal or 0.0)

            # Basic checks
            if employee_count == 0:
                vision_reasons.append("employee_count_zero")
            if summary_subtotal <= 0.0:
                vision_reasons.append("summary_subtotal_zero")

            # If summary exists, enforce ±25% consistency between vision rows subtotal and summary subtotal
            if summary_subtotal > 0.0:
                try:
                    ratio = vision_subtotal / max(1.0, summary_subtotal)
                except Exception:
                    ratio = 0.0
                if ratio < 0.75 or ratio > 1.25:
                    vision_reasons.append("total_mismatch")
                    try:
                        log_event(logger, "VISION_TOTAL_MISMATCH", pdf_path=pdf_path, run_id=run_id or "", vision_subtotal=vision_subtotal, summary_subtotal=summary_subtotal, ratio=round(ratio, 3))
                    except Exception:
                        pass

            # Hour limits
            hours_list = [float(r.hours or 0.0) for r in rows]
            if any(h > 400.0 for h in hours_list):
                vision_reasons.append("employee_hours_exceed_400")
            avg_hours = (sum(hours_list) / employee_count) if employee_count else 0.0
            if avg_hours > 350.0:
                vision_reasons.append("avg_hours_gt_350")

            # Final acceptance: require employee_count>0, summary_subtotal>0 and ratio within ±25%
            if vision_reasons:
                # Mark rejected
                warnings.append(f"vision_validated:rejected:{';'.join(vision_reasons)}")
                try:
                    log_event(logger, "VISION_RESULT_REJECTED", pdf_path=pdf_path, run_id=run_id or "", reasons=vision_reasons, employee_count=employee_count, summary_subtotal=summary_subtotal, vision_subtotal=vision_subtotal)
                except Exception:
                    pass
                # signal rejection by setting low confidence and success false
                confidence = 0.0
                log_event(logger, "VISION_EXTRACTION_COMPLETED", pdf_path=pdf_path, run_id=run_id or "", accepted=False, reasons=vision_reasons)
                return ExtractionResult(
                    success=False,
                    format=TimesheetFormat.GENERIC,
                    layout=InvoiceLayout.PROJECT_BASED if any(r.project_id for r in rows) else InvoiceLayout.EMPLOYEE_BASED,
                    rows=rows,
                    financials=fin,
                    metadata=TimesheetMetadata(),
                    confidence=0.0,
                    used_ocr=False,
                    used_vision=True,
                    raw_text="",
                    warnings=warnings,
                    processing_time_ms=int((time.time() - started) * 1000),
                )
            else:
                warnings.append("vision_validated:accepted")
                try:
                    log_event(logger, "VISION_RESULT_ACCEPTED", pdf_path=pdf_path, run_id=run_id or "", employee_count=employee_count, subtotal=summary_subtotal)
                except Exception:
                    pass
                log_event(logger, "VISION_EXTRACTION_COMPLETED", pdf_path=pdf_path, run_id=run_id or "", accepted=True)


        metadata = TimesheetMetadata(
            client_name=_clean(raw.get("client_name")) or None,
            period_month=_clean(raw.get("invoice_month")) or None,
        )
        layout = InvoiceLayout.PROJECT_BASED if any(r.project_id for r in rows) else InvoiceLayout.EMPLOYEE_BASED
        confidence = 0.82 if rows else 0.35
        if rows and any("vision_amount_corrected" in str(w) for w in warnings):
            confidence = 0.72

        log_event(
            logger,
            "vision_extraction_complete",
            run_id=run_id or "",
            pdf_path=pdf_path,
            rows=len(rows),
            pages=len(images),
            confidence=confidence,
        )

        return ExtractionResult(
            success=bool(rows),
            format=TimesheetFormat.GENERIC,
            layout=layout,
            rows=rows,
            financials=fin,
            metadata=metadata,
            confidence=confidence,
            used_ocr=False,
            used_vision=True,
            raw_text="",
            warnings=warnings,
            processing_time_ms=int((time.time() - started) * 1000),
        )
    except Exception as exc:
        logger.warning("Vision extraction failed: %s", exc)
        warnings.append(f"vision_failed:{str(exc)}")
        return ExtractionResult(
            success=False,
            format=TimesheetFormat.UNKNOWN,
            layout=InvoiceLayout.PROJECT_BASED,
            rows=[],
            financials=InvoiceFinancials(),
            metadata=TimesheetMetadata(),
            confidence=0.0,
            used_ocr=False,
            used_vision=True,
            raw_text="",
            warnings=warnings,
            error=str(exc),
            processing_time_ms=int((time.time() - started) * 1000),
        )


def _rows_from_payload(payload: Dict[str, Any], warnings: List[str]) -> List[InvoiceRow]:
    rows: List[InvoiceRow] = []
    for idx, item in enumerate(payload.get("rows") if isinstance(payload.get("rows"), list) else [], 1):
        if not isinstance(item, dict):
            warnings.append(f"vision_row_rejected:not_object:{idx}")
            continue

        trade = _normalize_trade(item.get("trade"))
        hours = max(0.0, _to_float(item.get("hours")))
        rate = max(0.0, _to_float(item.get("rate")))
        amount = max(0.0, _to_float(item.get("amount")))

        if not trade:
            warnings.append(f"vision_row_rejected:missing_trade:{idx}")
            continue
        if hours <= 0 and amount > 0 and rate > 0:
            hours = round(amount / rate, 2)
        if rate <= 0 and amount > 0 and hours > 0:
            rate = round(amount / hours, 4)
        if amount <= 0 and hours > 0 and rate > 0:
            amount = round(hours * rate, 2)
        if hours <= 0 or rate <= 0 or amount <= 0:
            warnings.append(f"vision_row_rejected:missing_numeric:{idx}")
            continue

        expected = round(hours * rate, 2)
        if expected > 0 and abs(expected - amount) > max(2.0, expected * 0.18):
            ratio = amount / expected
            if ratio < 0.1 or ratio > 10:
                warnings.append(f"vision_amount_corrected:{trade}")
                amount = expected
            else:
                warnings.append(f"vision_low_confidence_amount:{trade}")

        project_id = _clean(item.get("project_id")) or None
        employee_id = _clean(item.get("employee_id")) or None
        if employee_id and re.fullmatch(r"\d+(?:\.\d+)?", employee_id):
            employee_id = None

        rows.append(
            InvoiceRow(
                trade=trade,
                project_id=project_id,
                employee_id=employee_id,
                hours=round(hours, 2),
                rate=round(rate, 4),
                amount=round(amount, 2),
            )
        )
    return rows


def _clean(value: Any) -> str:
    return " ".join(str(value or "").split()).strip()


def _normalize_trade(value: Any) -> str:
    cleaned = re.sub(r"[^A-Za-z\s/&.-]", " ", _clean(value))
    return " ".join(cleaned.split()).upper()


def _to_float(value: Any) -> float:
    if isinstance(value, (int, float)):
        return float(value)
    cleaned = re.sub(r"[^0-9.\-]", "", str(value or ""))
    try:
        return float(cleaned) if cleaned else 0.0
    except ValueError:
        return 0.0
