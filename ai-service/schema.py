<<<<<<< HEAD
﻿"""
=======
"""
>>>>>>> 2484f72e1eb51ddf60a6f00e07ada7c5c77025f0
schema.py

Unified data models for:
- OCR extraction
- Attendance validation
- Invoice generation
- Dynamic deductions
- Dynamic VAT

Supports:
- MCC
- BKC
- Generic labour timesheets
"""

from __future__ import annotations

from dataclasses import (
    dataclass,
    field,
)

from enum import Enum

from typing import (
    Any,
    Dict,
    List,
    Optional,
)

# ---------------------------------------------------------------------------
# Enums
# ---------------------------------------------------------------------------

class TimesheetFormat(str, Enum):

    MCC = "mcc"

    BKC = "bkc"

    GENERIC = "generic"

    UNKNOWN = "unknown"


class InvoiceLayout(str, Enum):

    PROJECT_BASED = "project_based"

    EMPLOYEE_BASED = "employee_based"


# ---------------------------------------------------------------------------
# Invoice row
# ---------------------------------------------------------------------------

@dataclass
class InvoiceRow:
    """
    One extracted invoice row.
    """

    # -----------------------------------------------------------------------
    # core fields
    # -----------------------------------------------------------------------

    trade: str

    hours: float

    rate: float

    amount: float

    # -----------------------------------------------------------------------
    # optional identifiers
    # -----------------------------------------------------------------------

    project_id: Optional[str] = None

    employee_id: Optional[str] = None

    id_no: Optional[str] = None

    # -----------------------------------------------------------------------
    # attendance validation
    # -----------------------------------------------------------------------

    calculated_hours: float = 0.0

    hours_match: bool = True

    attendance_days: int = 0

    overtime_hours: float = 0.0

    # -----------------------------------------------------------------------
    # deductions
    # -----------------------------------------------------------------------

    deductions: Dict[str, float] = field(
        default_factory=dict
    )

    deduction_total: float = 0.0

    # -----------------------------------------------------------------------
    # VAT
    # -----------------------------------------------------------------------

    vat_rate: float = 0.05

    vat_amount: float = 0.0

    net_amount: float = 0.0

    # -----------------------------------------------------------------------
<<<<<<< HEAD
    # audit fields (preserve original OCR values)
    # -----------------------------------------------------------------------
    original_hours: float | None = None
    original_amount: float | None = None

    # -----------------------------------------------------------------------
=======
>>>>>>> 2484f72e1eb51ddf60a6f00e07ada7c5c77025f0
    # compute VAT
    # -----------------------------------------------------------------------

    def compute_vat(
        self,
        vat_rate: float,
    ) -> None:

        self.vat_rate = vat_rate

        self.vat_amount = round(
            self.amount * vat_rate,
            2,
        )

        self.net_amount = round(
            self.amount + self.vat_amount,
            2,
        )

    # -----------------------------------------------------------------------
    # identifier
    # -----------------------------------------------------------------------

    @property
    def identifier(self) -> str:

        return (
            self.project_id
            or self.employee_id
            or self.id_no
            or "-"
        )

    # -----------------------------------------------------------------------
    # validation
    # -----------------------------------------------------------------------

    @property
    def validation_ok(self) -> bool:

        return (
            self.hours_match
            and self.hours >= 0
            and self.rate >= 0
            and self.amount >= 0
        )


# ---------------------------------------------------------------------------
# Financial summary
# ---------------------------------------------------------------------------

@dataclass
class InvoiceFinancials:

    subtotal: float = 0.0

    total_vat: float = 0.0

    gross_total: float = 0.0

    total_deduction: float = 0.0

    deduction_vat: float = 0.0

    deduction_total_with_vat: float = 0.0

    adjusted_subtotal: float = 0.0

    net_payable: float = 0.0

    deduction_source: str = ""

    summary_detected: bool = False

    deduction_breakdown: Dict[str, float] = field(
        default_factory=dict
    )


# ---------------------------------------------------------------------------
# Metadata
# ---------------------------------------------------------------------------

@dataclass
class TimesheetMetadata:

    source_invoice_no: Optional[str] = None

    timesheet_no: Optional[str] = None

    period_from: Optional[str] = None

    period_to: Optional[str] = None

    period_month: Optional[str] = None

    client_name: Optional[str] = None

    client_trn: Optional[str] = None

    client_address: Optional[str] = None

    client_po_box: Optional[str] = None

    client_tel: Optional[str] = None

    client_fax: Optional[str] = None

    sub_contractor: Optional[str] = None

    currency: str = "AED"


# ---------------------------------------------------------------------------
# Extraction result
# ---------------------------------------------------------------------------

@dataclass
class ExtractionResult:

    success: bool

    format: TimesheetFormat

    layout: InvoiceLayout

    rows: List[InvoiceRow]

    financials: InvoiceFinancials

    metadata: TimesheetMetadata

    confidence: float

    used_ocr: bool = False

    used_vision: bool = False

    raw_text: str = ""

    warnings: List[str] = field(
        default_factory=list
    )

    error: Optional[str] = None

    processing_time_ms: int = 0

    # -----------------------------------------------------------------------
    # serialize
    # -----------------------------------------------------------------------

    def to_dict(self) -> Dict[str, Any]:

        return {

            "success": self.success,

            "format": self.format.value,

            "layout": self.layout.value,

            "confidence": round(
                self.confidence,
                3,
            ),

            "used_ocr": self.used_ocr,

            "used_vision": self.used_vision,

            "warnings": self.warnings,

            "error": self.error,

            "processing_time_ms": self.processing_time_ms,

            # ----------------------------------------------------------------
            # metadata
            # ----------------------------------------------------------------

            "metadata": {

                "source_invoice_no":
                    self.metadata.source_invoice_no,

                "timesheet_no":
                    self.metadata.timesheet_no,

                "period_from":
                    self.metadata.period_from,

                "period_to":
                    self.metadata.period_to,

                "period_month":
                    self.metadata.period_month,

                "client_name":
                    self.metadata.client_name,

                "client_trn":
                    self.metadata.client_trn,

                "client_address":
                    self.metadata.client_address,

                "client_po_box":
                    self.metadata.client_po_box,

                "client_tel":
                    self.metadata.client_tel,

                "client_fax":
                    self.metadata.client_fax,

                "sub_contractor":
                    self.metadata.sub_contractor,

                "currency":
                    self.metadata.currency,
            },

            # ----------------------------------------------------------------
            # rows
            # ----------------------------------------------------------------

            "rows": [

                {

                    "trade": r.trade,

                    "project_id": r.project_id,

                    "employee_id": r.employee_id,

                    "id_no": r.id_no,

                    "hours": r.hours,

                    "calculated_hours":
                        r.calculated_hours,

                    "hours_match":
                        r.hours_match,

                    "attendance_days":
                        r.attendance_days,

                    "overtime_hours":
                        r.overtime_hours,

                    "rate": r.rate,

                    "amount": r.amount,

                    "deductions":
                        r.deductions,

                    "deduction_total":
                        r.deduction_total,

                    "vat_rate":
                        r.vat_rate,

                    "vat_amount":
                        r.vat_amount,

                    "net_amount":
                        r.net_amount,
                }

                for r in self.rows
            ],

            # ----------------------------------------------------------------
            # financials
            # ----------------------------------------------------------------

            "financials": {

                "subtotal":
                    self.financials.subtotal,

                "total_vat":
                    self.financials.total_vat,

                "gross_total":
                    self.financials.gross_total,

                "total_deduction":
                    self.financials.total_deduction,

                "deduction_vat":
                    self.financials.deduction_vat,

                "deduction_total_with_vat":
                    self.financials.deduction_total_with_vat,

                "adjusted_subtotal":
                    self.financials.adjusted_subtotal,

                "net_payable":
                    self.financials.net_payable,

                "deduction_source":
                    self.financials.deduction_source,

                "summary_detected":
                    self.financials.summary_detected,

                "deduction_breakdown":
                    self.financials.deduction_breakdown,
            },
        }


# ---------------------------------------------------------------------------
# Company profile
# ---------------------------------------------------------------------------

@dataclass
class CompanyProfile:

    name: str

    trn: str

    vat_rate: float = 0.05

    invoice_number: str = "INV-001"

    invoice_date: str = ""

    mobile: str = ""

    email: str = ""

    website: str = ""

    logo_path: Optional[str] = None

    signature_path: Optional[str] = None

    stamp_path: Optional[str] = None

    template_path: Optional[str] = None

    address: str = ""

    currency: str = "AED"

    # -----------------------------------------------------------------------
    # parser
    # -----------------------------------------------------------------------

    @classmethod
    def from_dict(
        cls,
        data: Dict[str, Any],
    ) -> "CompanyProfile":

        return cls(

            name=data.get("name") or "Company",

            trn=data.get("trn") or "-",

            vat_rate=float(
                data.get("vatRate", 0.05)
            ),

            invoice_number=str(
                data.get("invoiceNumber")
                or "INV-001"
            ),

            invoice_date=str(
                data.get("invoiceDate")
                or ""
            ),

            mobile=data.get("mobileNumber")
                   or data.get("mobile")
                   or "",

            email=data.get("contactEmail")
                  or data.get("email")
                  or "",

            website=data.get("websiteLink")
                    or data.get("website")
                    or "",

            logo_path=data.get("logoPath"),

            signature_path=data.get("signaturePath")
                           or data.get("signature_path"),

            stamp_path=data.get("stampPath")
                       or data.get("stamp_path"),

            template_path=data.get("templatePath")
                          or data.get("template_path"),

            address=data.get("address")
                    or "",

            currency=data.get("currency")
                     or "AED",
        )


# ---------------------------------------------------------------------------
# Validation helpers
# ---------------------------------------------------------------------------

def validate_rows(
    rows: List[InvoiceRow],
) -> bool:

    if not rows:
        return False

    for r in rows:

        if not r.trade:
            return False

        if r.hours < 0:
            return False

        if r.rate < 0:
            return False

        if r.amount < 0:
            return False

    return True


def validate_extraction(
    result: ExtractionResult,
) -> bool:

    return (
        result.success
        and validate_rows(result.rows)
<<<<<<< HEAD
    )
=======
    )
>>>>>>> 2484f72e1eb51ddf60a6f00e07ada7c5c77025f0
