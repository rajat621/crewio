import os
import base64
from datetime import datetime
from typing import Any, Dict, List, Optional
from reportlab.lib import colors
from reportlab.lib.pagesizes import A4
from reportlab.lib.units import mm
from reportlab.pdfgen import canvas

try:
    from pdf2image import convert_from_path
except Exception:
    convert_from_path = None


def _ensure_dir(path: str) -> None:
    os.makedirs(path, exist_ok=True)


def _template_to_image(template_path: Optional[str], out_dir: str) -> Optional[str]:
    if not template_path or not os.path.exists(template_path):
        return None

    ext = os.path.splitext(template_path)[1].lower()
    if ext in {".png", ".jpg", ".jpeg"}:
        return template_path

    if ext == ".pdf" and convert_from_path is not None:
        try:
            poppler_path = _find_poppler_path()
            kwargs = {"first_page": 1, "last_page": 1, "dpi": 180}
            if poppler_path:
                kwargs["poppler_path"] = poppler_path
            images = convert_from_path(template_path, **kwargs)
            if not images:
                return None
            image_path = os.path.join(out_dir, "template_bg.png")
            images[0].save(image_path, "PNG")
            return image_path
        except Exception:
            return None

    return None


def _find_poppler_path() -> Optional[str]:
    """Find Poppler bin directory for pdf2image on Windows/local installs."""
    # If binaries are already in PATH, pdf2image works without poppler_path.
    # Returning None here lets convert_from_path use PATH directly.
    common_candidates = [
        r"C:\Program Files\poppler\Library\bin",
        r"C:\Program Files\poppler\bin",
    ]

    local_base = os.path.expandvars(r"%LOCALAPPDATA%\Microsoft\WinGet\Packages")
    if local_base and os.path.isdir(local_base):
        try:
            for name in os.listdir(local_base):
                if "poppler" not in name.lower():
                    continue
                candidate = os.path.join(local_base, name)
                for root, dirs, files in os.walk(candidate):
                    if "pdfinfo.exe" in files:
                        return root
        except Exception:
            pass

    for candidate in common_candidates:
        if os.path.exists(os.path.join(candidate, "pdfinfo.exe")):
            return candidate

    return None


def _materialize_asset(asset_value: Optional[str], out_dir: str, file_prefix: str) -> Optional[str]:
    """Resolve either file path or base64 payload into a local file path."""
    if not asset_value or not isinstance(asset_value, str):
        return None

    candidate = asset_value.strip()
    if not candidate:
        return None

    if os.path.exists(candidate):
        return candidate

    b64_payload = candidate
    ext = ".bin"

    if candidate.startswith("data:") and ";base64," in candidate:
        header, b64_payload = candidate.split(";base64,", 1)
        mime = header.split(":", 1)[1].lower()
        if "pdf" in mime:
            ext = ".pdf"
        elif "png" in mime:
            ext = ".png"
        elif "jpeg" in mime or "jpg" in mime:
            ext = ".jpg"
        elif "webp" in mime:
            ext = ".webp"

    try:
        raw = base64.b64decode(b64_payload, validate=False)
    except Exception:
        return None

    if not raw:
        return None

    # Infer extension when no mime header is present.
    if ext == ".bin":
        if raw.startswith(b"%PDF"):
            ext = ".pdf"
        elif raw.startswith(b"\x89PNG"):
            ext = ".png"
        elif raw.startswith(b"\xff\xd8\xff"):
            ext = ".jpg"
        elif raw.startswith(b"RIFF") and b"WEBP" in raw[:32]:
            ext = ".webp"
        else:
            ext = ".png"

    file_path = os.path.join(out_dir, f"{file_prefix}{ext}")
    try:
        with open(file_path, "wb") as f:
            f.write(raw)
        return file_path
    except Exception:
        return None


def _number_to_words(num: float) -> str:
    """Convert amount to words for invoice footer."""
    ones = [
        "Zero",
        "One",
        "Two",
        "Three",
        "Four",
        "Five",
        "Six",
        "Seven",
        "Eight",
        "Nine",
        "Ten",
        "Eleven",
        "Twelve",
        "Thirteen",
        "Fourteen",
        "Fifteen",
        "Sixteen",
        "Seventeen",
        "Eighteen",
        "Nineteen",
    ]
    tens = ["", "", "Twenty", "Thirty", "Forty", "Fifty", "Sixty", "Seventy", "Eighty", "Ninety"]

    def under_thousand(n: int) -> str:
        parts: List[str] = []
        if n >= 100:
            parts.append(f"{ones[n // 100]} Hundred")
            n %= 100
        if n >= 20:
            parts.append(tens[n // 10])
            if n % 10:
                parts.append(ones[n % 10])
        elif n > 0:
            parts.append(ones[n])
        return " ".join(parts)

    integer = int(num)
    fraction = int(round((num - integer) * 100))
    if fraction == 100:
        integer += 1
        fraction = 0

    if integer == 0:
        words = "Zero"
    else:
        groups = [(1_000_000_000, "Billion"), (1_000_000, "Million"), (1_000, "Thousand"), (1, "")]
        parts = []
        remaining = integer
        for value, suffix in groups:
            if remaining >= value:
                chunk = remaining // value
                remaining %= value
                chunk_words = under_thousand(chunk)
                parts.append(f"{chunk_words} {suffix}".strip())
        words = " ".join(parts)

    if fraction:
        return f"{words} Dirhams and {fraction:02d} Fils Only"
    return f"{words} Dirhams Only"


def _safe_float(value: Any, default: float = 0.0) -> float:
    try:
        return float(value)
    except Exception:
        return default


def _line_chunks(text: str, max_chars: int) -> List[str]:
    if not text:
        return []
    words = str(text).split()
    lines: List[str] = []
    current = ""
    for word in words:
        probe = f"{current} {word}".strip()
        if len(probe) <= max_chars:
            current = probe
        else:
            if current:
                lines.append(current)
            current = word
    if current:
        lines.append(current)
    return lines


def generate_invoice_pdf(
    output_dir: str,
    extracted: Dict[str, Any],
    company_data: Dict[str, Any],
    template_path: Optional[str] = None,
    signature_path: Optional[str] = None,
    stamp_path: Optional[str] = None,
) -> str:
    _ensure_dir(output_dir)
    output_path = os.path.join(output_dir, f"tax-invoice-{int(datetime.now().timestamp())}.pdf")

    c = canvas.Canvas(output_path, pagesize=A4)
    width, height = A4

    resolved_template = _materialize_asset(template_path, output_dir, "invoice-template")
    resolved_signature = _materialize_asset(signature_path, output_dir, "invoice-signature")
    resolved_stamp = _materialize_asset(stamp_path, output_dir, "invoice-stamp")

    # Draw template background if available (supports image or first page of PDF)
    bg_path = _template_to_image(resolved_template, output_dir)
    if bg_path and os.path.exists(bg_path):
        try:
            c.drawImage(bg_path, 0, 0, width=width, height=height, preserveAspectRatio=False, mask="auto")
        except Exception:
            pass
    else:
        c.setFillColor(colors.white)
        c.rect(0, 0, width, height, stroke=0, fill=1)

    # White content area where dynamic details are written.
    content_left = 36 * mm
    content_right = width - 12 * mm

    company_name = company_data.get("name") or "Company"
    trn = company_data.get("trn") or "-"
    vat_rate = _safe_float(company_data.get("vatRate"), 5.0)
    invoice_number = company_data.get("invoiceNumber") or "INV-001"
    invoice_date_raw = company_data.get("invoiceDate") or datetime.now().strftime("%d/%m/%Y")
    invoice_date = str(invoice_date_raw).replace("/", ".")
    client_name = company_data.get("clientName") or "Client"
    address = company_data.get("address") or ""
    city = company_data.get("city") or ""
    mobile = company_data.get("mobileNumber") or ""
    contact_email = company_data.get("contactEmail") or ""
    website = company_data.get("websiteLink") or ""
    logo_path = company_data.get("logoPath")

    rows: List[Dict[str, Any]] = extracted.get("invoice_summary", {}).get("rows", [])
    c.setFillColor(colors.black)

    # Keep heading untouched; print invoice details below header area.
    meta_y = height - 47 * mm
    c.setFont("Helvetica-Bold", 9)
    c.drawString(content_left + 2, meta_y, f"Invoice No.{invoice_number}")
    c.drawRightString(content_right - 2, meta_y, f"Date. {invoice_date}")

    info_y = meta_y - 6.5 * mm
    c.setFont("Helvetica-Bold", 9)
    c.drawString(content_left + 2, info_y, f"M/s. {client_name}")

    details = []
    details.extend(_line_chunks(address, 42))
    if city:
        details.append(city)
    if mobile:
        details.append(f"Tel No {mobile}")
    details.append(f"TRN: {trn}")

    c.setFont("Helvetica-Bold", 8.6)
    yy = info_y - 4.8 * mm
    for line in details[:6]:
        c.drawString(content_left + 2, yy, line)
        yy -= 4.4 * mm

    try:
        date_obj = datetime.strptime(str(invoice_date_raw).split()[0], "%d/%m/%Y")
    except Exception:
        date_obj = datetime.now()
    month_line = f"Invoice for the month of {date_obj.strftime('%B %Y')}"
    c.setFont("Helvetica-Bold", 10)
    c.drawCentredString((content_left + content_right) / 2, yy - 5 * mm, month_line)

    table_top = yy - 8.5 * mm
    table_x = content_left + 1
    table_w = content_right - content_left - 2
    row_h = 5.1 * mm
    headers = ["SI NO", "TRADE", "ProjectNo.", "No. ofhours", "UnitPrice", "Amount", "VAT", "VATAmount", "NetAmount"]
    col_fracs = [0.075, 0.155, 0.12, 0.12, 0.105, 0.12, 0.07, 0.11, 0.125]
    col_widths = [table_w * f for f in col_fracs]

    c.setStrokeColor(colors.black)
    c.setLineWidth(0.45)
    c.setFillColor(colors.HexColor("#0b78c2"))
    c.rect(table_x, table_top - row_h, table_w, row_h, stroke=1, fill=1)
    c.setFillColor(colors.white)
    c.setFont("Helvetica-Bold", 7)
    x_cursor = table_x
    for idx, header in enumerate(headers):
        c.rect(x_cursor, table_top - row_h, col_widths[idx], row_h, stroke=1, fill=0)
        c.drawCentredString(x_cursor + col_widths[idx] / 2, table_top - row_h + 1.6, header)
        x_cursor += col_widths[idx]

    c.setFillColor(colors.black)
    c.setFont("Helvetica", 7)
    y_row = table_top - row_h

    total_amount = 0.0
    total_vat = 0.0
    total_net = 0.0
    max_rows = 11
    for i, row in enumerate(rows[:max_rows], start=1):
        y_row -= row_h
        c.rect(table_x, y_row, table_w, row_h, stroke=1, fill=0)

        trade = str(row.get("trade") or "").upper()
        project_no = str(row.get("project_id") or "")
        hours = _safe_float(row.get("hours"), 0.0)
        unit_price = _safe_float(row.get("rate"), 0.0)
        amount = _safe_float(row.get("amount"), 0.0)
        vat_frac = vat_rate / 100.0
        vat_amount = amount * vat_frac
        net_amount = amount + vat_amount

        total_amount += amount
        total_vat += vat_amount
        total_net += net_amount

        values = [
            f"{i}",
            trade,
            project_no,
            f"{hours:.0f}" if hours.is_integer() else f"{hours:.2f}",
            f"{unit_price:.1f}",
            f"{amount:,.2f}",
            f"{vat_frac:.2f}",
            f"{vat_amount:,.2f}",
            f"{net_amount:,.2f}",
        ]

        x_cursor = table_x
        for idx, value in enumerate(values):
            c.rect(x_cursor, y_row, col_widths[idx], row_h, stroke=1, fill=0)
            if idx in (0, 3, 4, 6):
                c.drawCentredString(x_cursor + col_widths[idx] / 2, y_row + 1.5, value)
            elif idx >= 5:
                c.drawRightString(x_cursor + col_widths[idx] - 1.5, y_row + 1.5, value)
            else:
                c.drawString(x_cursor + 1.5, y_row + 1.5, value)
            x_cursor += col_widths[idx]

    deduction = _safe_float(company_data.get("deductions"), 0.0)
    y_row -= row_h
    c.setFont("Helvetica-Bold", 7)
    c.rect(table_x, y_row, table_w, row_h, stroke=1, fill=0)
    c.drawString(table_x + 1.5, y_row + 1.5, "TOTAL DEDUCTION")
    c.drawRightString(table_x + table_w - 1.5, y_row + 1.5, f"{deduction:,.2f}")

    payable_total = max(total_net - deduction, 0.0)
    y_row -= row_h
    c.setFillColor(colors.HexColor("#0b78c2"))
    c.rect(table_x, y_row, table_w, row_h, stroke=1, fill=1)
    c.setFillColor(colors.white)
    c.setFont("Helvetica-Bold", 8)
    c.drawString(table_x + 1.5, y_row + 1.4, "TOTAL")
    c.drawRightString(table_x + table_w - 1.5, y_row + 1.4, f"{payable_total:,.2f}")

    y_row -= row_h
    c.setFillColor(colors.black)
    c.setFont("Helvetica-Bold", 7)
    c.rect(table_x, y_row, table_w, row_h, stroke=1, fill=0)
    c.drawString(table_x + 1.5, y_row + 1.5, "In words :-")
    c.drawString(table_x + 40 * mm, y_row + 1.5, _number_to_words(payable_total))

    # Regards, owner name, TRN, signature and stamp in lower white area.
    footer_y = 46 * mm
    c.setFont("Helvetica-Bold", 10)
    c.drawString(content_left + 2, footer_y, "Thanks        and        Regards")
    c.setFont("Helvetica", 10)
    c.drawString(content_left + 2, footer_y - 5.3 * mm, company_name)
    c.setFont("Helvetica-Bold", 9)
    c.drawString(content_left + 2, footer_y - 10.2 * mm, f"TRN No. {trn}")

    if resolved_signature and os.path.exists(resolved_signature):
        try:
            c.drawImage(
                resolved_signature,
                content_left + 8 * mm,
                17 * mm,
                width=22 * mm,
                height=17 * mm,
                preserveAspectRatio=True,
                mask="auto",
            )
        except Exception:
            pass

    if resolved_stamp and os.path.exists(resolved_stamp):
        try:
            c.drawImage(
                resolved_stamp,
                content_left + 38 * mm,
                16 * mm,
                width=24 * mm,
                height=24 * mm,
                preserveAspectRatio=True,
                mask="auto",
            )
        except Exception:
            pass

    # Optional fallback footer only when no template exists.
    if not (bg_path and os.path.exists(bg_path)):
        c.setStrokeColor(colors.HexColor("#8f98a6"))
        c.line(content_left, 12 * mm, content_right, 12 * mm)
        c.setFont("Helvetica-Bold", 7.5)
        c.setFillColor(colors.HexColor("#2a2f37"))
        c.drawString(content_left + 1, 8.6 * mm, company_name.upper())
        c.setFont("Helvetica", 6.8)
        contact_line = " | ".join([s for s in [mobile, contact_email, website] if s])
        if contact_line:
            c.drawRightString(content_right - 1, 8.6 * mm, contact_line)

    c.save()
    return output_path
