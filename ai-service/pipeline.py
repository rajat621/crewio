import logging
import os
import re
from dataclasses import dataclass
from typing import Any, Dict, List, Optional, Tuple

import PyPDF2

try:
    from pdf2image import convert_from_path
    import pytesseract
    pytesseract.pytesseract.pytesseract_cmd = r'C:\Program Files\Tesseract-OCR\tesseract.exe'
except Exception:  # pragma: no cover
    convert_from_path = None
    pytesseract = None

logger = logging.getLogger(__name__)


INVOICE_KEYWORDS = {
    "trade",
    "project",
    "hour",
    "hours",
    "rate",
    "amount",
    "vat",
    "net",
    "total",
}

ATTENDANCE_KEYWORDS = {
    "employee",
    "attendance",
    "absent",
    "days",
    "trade",
    "rate",
    "hour",
    "hours",
    "deduction",
}

TRADE_HINTS = {
    "steel fixer",
    "mason",
    "tile mason",
    "carpenter",
    "electrician",
    "plumber",
    "helper",
    "painter",
}


@dataclass
class PageExtraction:
    page_number: int
    text: str
    source: str  # text|ocr


class HybridExtractor:
    def extract_pages(self, pdf_path: str) -> List[PageExtraction]:
        pages: List[PageExtraction] = []
        with open(pdf_path, "rb") as fh:
            reader = PyPDF2.PdfReader(fh)
            for idx, page in enumerate(reader.pages, start=1):
                text = (page.extract_text() or "").strip()
                source = "text"
                if len(text) < 80:
                    ocr_text = self._ocr_page(pdf_path, idx)
                    if ocr_text:
                        text = ocr_text.strip()
                        source = "ocr"
                pages.append(PageExtraction(page_number=idx, text=text, source=source))
        return pages

    def _ocr_page(self, pdf_path: str, page_number: int) -> str:
        if convert_from_path is None or pytesseract is None:
            return ""
        try:
            images = convert_from_path(
                pdf_path,
                first_page=page_number,
                last_page=page_number,
                dpi=200,
            )
            if not images:
                return ""
            return pytesseract.image_to_string(images[0])
        except Exception as exc:  # pragma: no cover
            logger.warning("OCR failed on page %s: %s", page_number, exc)
            return ""


class TableClassifier:
    def classify_page(self, text: str) -> Tuple[str, float]:
        lower = text.lower()
        invoice_score = self._score(lower, INVOICE_KEYWORDS)
        attendance_score = self._score(lower, ATTENDANCE_KEYWORDS)

        if attendance_score > invoice_score and attendance_score > 0:
            return "attendance", min(1.0, attendance_score / 6.0)
        if invoice_score > 0:
            return "invoice_summary", min(1.0, invoice_score / 6.0)
        return "unknown", 0.0

    @staticmethod
    def _score(text: str, words: set[str]) -> float:
        return float(sum(1 for w in words if w in text))


class TableNormalizer:
    def normalize(self, table_type: str, rows: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
        if table_type == "invoice_summary":
            return [self._normalize_invoice_row(r) for r in rows if r]
        if table_type == "attendance":
            return [self._normalize_attendance_row(r) for r in rows if r]
        return rows

    @staticmethod
    def _to_float(value: Any) -> Optional[float]:
        if value is None:
            return None
        if isinstance(value, (int, float)):
            return float(value)
        cleaned = re.sub(r"[^0-9.\-]", "", str(value))
        if not cleaned:
            return None
        try:
            return float(cleaned)
        except ValueError:
            return None

    def _normalize_invoice_row(self, row: Dict[str, Any]) -> Dict[str, Any]:
        return {
            "trade": str(row.get("trade") or "").strip().upper(),
            "project_id": (str(row.get("project_id") or "").strip() or None),
            "hours": self._to_float(row.get("hours")),
            "rate": self._to_float(row.get("rate")),
            "amount": self._to_float(row.get("amount")),
            "vat": self._to_float(row.get("vat")),
            "vat_amount": self._to_float(row.get("vat_amount")),
            "net_amount": self._to_float(row.get("net_amount")),
        }

    def _normalize_attendance_row(self, row: Dict[str, Any]) -> Dict[str, Any]:
        return {
            "employee_id": str(row.get("employee_id") or "").strip() or None,
            "employee_name": str(row.get("employee_name") or "").strip() or None,
            "trade": str(row.get("trade") or "").strip().upper() or None,
            "rate": self._to_float(row.get("rate")),
            "total_hours": self._to_float(row.get("total_hours")),
            "absent_count": self._to_float(row.get("absent_count")),
            "deductions": self._to_float(row.get("deductions")),
            "raw_attendance": row.get("raw_attendance") or "",
        }


def _parse_invoice_row(line: str) -> Optional[Dict[str, Any]]:
    compact = " ".join(line.split())
    if len(compact) < 8:
        return None

    if "total" in compact.lower() and not any(t in compact.lower() for t in TRADE_HINTS):
        return None

    project_match = re.search(r"\bP\d{2,6}[A-Z0-9]*\b", compact, re.IGNORECASE)
    project_id = project_match.group(0).upper() if project_match else None

    numbers = re.findall(r"\d{1,3}(?:,\d{3})*(?:\.\d+)?", compact)
    if len(numbers) < 3:
        return None

    trade_part = compact
    if project_match:
        trade_part = compact[: project_match.start()]
    else:
        m = re.search(r"\b\d", compact)
        if m:
            trade_part = compact[: m.start()]

    trade = trade_part.strip(" -")
    if not trade:
        return None

    return {
        "trade": trade,
        "project_id": project_id,
        "hours": numbers[0],
        "rate": numbers[1] if len(numbers) > 1 else None,
        "amount": numbers[2] if len(numbers) > 2 else None,
        "vat": numbers[3] if len(numbers) > 3 else None,
        "vat_amount": numbers[4] if len(numbers) > 4 else None,
        "net_amount": numbers[5] if len(numbers) > 5 else None,
    }


def _parse_attendance_row(line: str) -> Optional[Dict[str, Any]]:
    compact = " ".join(line.split())
    if len(compact) < 12:
        return None

    if "employee" in compact.lower() and "trade" in compact.lower():
        return None

    emp_match = re.search(r"\b[A-Z]{1,3}\d{4,}\b", compact)
    trade_match = next((t for t in TRADE_HINTS if t in compact.lower()), None)

    numbers = re.findall(r"\d+(?:\.\d+)?", compact)
    if len(numbers) < 2 or (not emp_match and not trade_match):
        return None

    employee_id = emp_match.group(0) if emp_match else None

    employee_name = None
    if employee_id:
        pos = compact.find(employee_id)
        tail = compact[pos + len(employee_id):].strip()
        employee_name = " ".join(tail.split()[:4])

    total_hours = numbers[-2] if len(numbers) >= 2 else None
    deductions = numbers[-1] if len(numbers) >= 1 else None

    return {
        "employee_id": employee_id,
        "employee_name": employee_name,
        "trade": trade_match,
        "rate": numbers[0] if numbers else None,
        "total_hours": total_hours,
        "absent_count": None,
        "deductions": deductions,
        "raw_attendance": compact,
    }


def _is_noisy_row(row: Dict[str, Any]) -> bool:
    """Detect and filter non-tabular rows (headers, footers, metadata)."""
    if not row:
        return True
    trade = str(row.get("trade") or "").strip().upper()
    # Filter common non-data rows
    if any(marker in trade for marker in ["TOTAL", "SUB-CONTRACTOR", "PREPARATION", "PRINT DATE", "ADDRESS", "TRN", "OFFICE", "EMAIL", "FAXNO"]):
        if not any(c.isdigit() for c in trade):
            return True
    return False


def parse_rows(page_text: str, table_type: str) -> List[Dict[str, Any]]:
    lines = [ln.strip() for ln in page_text.splitlines() if ln.strip()]
    rows: List[Dict[str, Any]] = []

    for line in lines:
        parsed = None
        if table_type == "invoice_summary":
            parsed = _parse_invoice_row(line)
        elif table_type == "attendance":
            parsed = _parse_attendance_row(line)

        if parsed and not _is_noisy_row(parsed):
            rows.append(parsed)

    return rows


def aggregate_attendance_to_invoice(rows: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
    grouped: Dict[Tuple[str, Optional[str]], Dict[str, Any]] = {}
    for row in rows:
        trade = (row.get("trade") or "UNKNOWN").upper()
        rate = row.get("rate") or 0.0
        key = (trade, str(rate))
        if key not in grouped:
            grouped[key] = {
                "trade": trade,
                "project_id": None,
                "hours": 0.0,
                "rate": float(rate),
                "amount": 0.0,
                "vat": None,
                "vat_amount": None,
                "net_amount": None,
            }
        hours = row.get("total_hours") or 0.0
        grouped[key]["hours"] += float(hours)
        grouped[key]["amount"] = grouped[key]["hours"] * grouped[key]["rate"]

    return list(grouped.values())


def summarize_invoice(rows: List[Dict[str, Any]]) -> Dict[str, Any]:
    subtotal = 0.0
    vat_total = 0.0
    net_total = 0.0

    for row in rows:
        amount = row.get("amount") or 0.0
        vat_amount = row.get("vat_amount")
        net_amount = row.get("net_amount")
        subtotal += float(amount)
        if vat_amount is not None:
            vat_total += float(vat_amount)
        if net_amount is not None:
            net_total += float(net_amount)

    if net_total == 0.0:
        net_total = subtotal + vat_total

    return {
        "subtotal": round(subtotal, 2),
        "vat_total": round(vat_total, 2),
        "net_total": round(net_total, 2),
    }


def get_ocr_capabilities() -> Dict[str, bool]:
    """Report OCR capability status."""
    return {
        "ocr_available": pytesseract is not None and convert_from_path is not None,
        "tesseract_available": pytesseract is not None,
        "pdf2image_available": convert_from_path is not None,
    }


def run_hybrid_extraction(pdf_path: str, document_type: str = "auto") -> Dict[str, Any]:
    extractor = HybridExtractor()
    classifier = TableClassifier()
    normalizer = TableNormalizer()

    pages = extractor.extract_pages(pdf_path)
    page_results: List[Dict[str, Any]] = []
    invoice_rows: List[Dict[str, Any]] = []
    attendance_rows: List[Dict[str, Any]] = []
    used_ocr = False

    for page in pages:
        used_ocr = used_ocr or page.source == "ocr"
        detected_type, confidence = classifier.classify_page(page.text)

        if document_type != "auto" and detected_type != document_type:
            # Still keep page metadata for observability
            page_results.append(
                {
                    "page": page.page_number,
                    "source": page.source,
                    "type": detected_type,
                    "confidence": confidence,
                    "rows_detected": 0,
                }
            )
            continue

        rows = parse_rows(page.text, detected_type)
        normalized_rows = normalizer.normalize(detected_type, rows)
        page_results.append(
            {
                "page": page.page_number,
                "source": page.source,
                "type": detected_type,
                "confidence": round(confidence, 3),
                "rows_detected": len(normalized_rows),
            }
        )

        if detected_type == "invoice_summary":
            invoice_rows.extend(normalized_rows)
        elif detected_type == "attendance":
            attendance_rows.extend(normalized_rows)

    computed_from_attendance = aggregate_attendance_to_invoice(attendance_rows)

    if not invoice_rows and computed_from_attendance:
        invoice_rows = computed_from_attendance

    invoice_totals = summarize_invoice(invoice_rows)
    best_type = "unknown"
    if invoice_rows:
        best_type = "invoice_summary"
    elif attendance_rows:
        best_type = "attendance"

    confidence = 0.0
    if page_results:
        confidence = max(p["confidence"] for p in page_results)

    return {
        "success": True,
        "document_type": document_type,
        "pipeline": {
            "used_ocr": used_ocr,
            "best_table_type": best_type,
            "confidence": round(float(confidence), 3),
        },
        "pages": page_results,
        "invoice_summary": {
            "rows": invoice_rows,
            "totals": invoice_totals,
        },
        "attendance": {
            "rows": attendance_rows,
        },
    }
