"""
main.py  (updated)

Flask API endpoints wired to the new extraction pipeline.

The key change: all endpoints now call run_extraction_pipeline()
which returns a NormalizedInvoice. The renderer only ever sees
this normalized structure — it does not know the extraction source.

Existing endpoints preserved for backward compatibility.
New /v2/ endpoints expose the clean pipeline directly.
"""

from __future__ import annotations

import hmac
import json as _json
import logging
import os
import tempfile
import uuid
from pathlib import Path
from werkzeug.utils import secure_filename
import pipeline

print("=" * 50)
print("PIPELINE MODULE =", pipeline.__file__)
print("=" * 50)
from dotenv import load_dotenv

load_dotenv()

from flask import Flask, g, jsonify, request, send_file
from flask_cors import CORS

from contracts import err, ok

# New clean pipeline
from extraction_pipeline import run_extraction_pipeline
from normalized_output import NormalizedInvoice

# change
from invoice_draft import (
    build_draft, recompute, validate_draft, draft_to_extraction_result,
)
# end
# Legacy pipeline (kept for backward compat)
from pipeline import run_extraction
from extractor import apply_semantic_overlay_to_result
from generator import generate_invoice_pdf
from schema import CompanyProfile, validate_extraction
from validation import score_extraction
from config_runtime import CONFIG, _to_int
from pipeline.structured_logging import (
    classify_failure, log_event, set_trace_context,
    stage_complete, stage_failure, stage_start,
)

app = Flask(__name__)
CORS(app)
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# No limit existed on request/upload size at all - combined with no
# authentication and open CORS, an unbounded upload is a real DoS vector
# (disk/memory/CPU exhaustion). Flask enforces this itself, rejecting
# oversized requests with 413 before the body is read into memory.
# Env-configurable so a deployment that genuinely needs a different
# ceiling isn't stuck with a hardcoded value; default is generous enough
# for a large multi-page scanned timesheet PDF.
_MAX_CONTENT_LENGTH_MB = _to_int(os.getenv("MAX_UPLOAD_SIZE_MB"), 50, minimum=1)
app.config["MAX_CONTENT_LENGTH"] = _MAX_CONTENT_LENGTH_MB * 1024 * 1024

# Confirmed via .env.example: AI_SERVICE_URL is a public Render.com
# domain, and this service has no other authentication layer and open
# CORS - meaning any internet client could currently invoke expensive
# OCR/PDF/AI operations directly. Opt-in: only enforced if the secret is
# actually configured on this service, so an existing deployment that
# hasn't set it yet on both sides is not broken by this change landing.
_SHARED_SECRET = os.getenv("AI_SERVICE_SHARED_SECRET", "").strip()
_APP_ENV = os.getenv("APP_ENV", "").strip().lower()
if not _SHARED_SECRET:
    if _APP_ENV == "production":
        raise RuntimeError(
            "FATAL: AI_SERVICE_SHARED_SECRET is not set with APP_ENV=production. "
            "Refusing to start with an unauthenticated, publicly-reachable AI "
            "service. Set AI_SERVICE_SHARED_SECRET (matching the Node backend's "
            "value) or explicitly set APP_ENV to a non-production value for "
            "local/dev use."
        )
    logger.warning(
        "AI_SERVICE_SHARED_SECRET is not set - this service currently accepts "
        "unauthenticated requests from any client that can reach it over the "
        "network. Set AI_SERVICE_SHARED_SECRET (matching the Node backend's "
        "value) to close this gap."
    )

_PUBLIC_PATHS = {"/", "/health", "/healthz"}


@app.before_request
def _enforce_shared_secret():
    if not _SHARED_SECRET:
        return None  # not configured on this deployment - see warning above
    if request.path in _PUBLIC_PATHS:
        return None
    supplied = request.headers.get("X-Internal-Service-Key", "")
    if not hmac.compare_digest(supplied, _SHARED_SECRET):
        return jsonify({"error": "unauthorized"}), 401
    return None

_UPLOAD_DIR = Path(tempfile.gettempdir()) / "ai-invoice-uploads"
_OUTPUT_DIR = Path(tempfile.gettempdir()) / "ai-invoice-outputs"
_UPLOAD_DIR.mkdir(parents=True, exist_ok=True)
_OUTPUT_DIR.mkdir(parents=True, exist_ok=True)


def _parse_bool(value, default=True):
    if isinstance(value, bool):
        return value
    if isinstance(value, str):
        if value.strip().lower() == "true":
            return True
        if value.strip().lower() == "false":
            return False
    return default


def _save_upload(file_obj) -> str:
    # Never trust the client-supplied filename for path construction -
    # pathlib's / operator does not sanitize ".." segments, and silently
    # discards the left operand entirely if the right side is an absolute
    # path, making the original `_UPLOAD_DIR / file_obj.filename` pattern
    # a real arbitrary-file-write vector. Generate a random, safe name
    # instead - this is temporary internal processing, nothing downstream
    # needs the client's original filename.
    original_name = secure_filename(file_obj.filename or "upload.pdf")
    suffix = Path(original_name).suffix if original_name else ""
    if not suffix or len(suffix) > 10 or not suffix.isascii():
        suffix = ".pdf"
    safe_name = f"{uuid.uuid4().hex}{suffix}"
    path = _UPLOAD_DIR / safe_name
    file_obj.save(str(path))
    return str(path)


@app.before_request
def _init_trace():
    request_id = request.headers.get("x-request-id") or str(uuid.uuid4())
    trace_id = request.headers.get("x-trace-id") or str(uuid.uuid4())
    g.request_id = request_id
    g.trace_id = trace_id
    set_trace_context(request_id=request_id, trace_id=trace_id)


@app.after_request
def _set_trace_headers(response):
    response.headers["x-request-id"] = getattr(g, "request_id", "")
    response.headers["x-trace-id"] = getattr(g, "trace_id", "")
    return response


# ---------------------------------------------------------------------------
# Health
# ---------------------------------------------------------------------------

@app.get("/")
def root():
    return jsonify({"status": "ok", "service": "AI Service"}), 200


@app.get("/health")
def health():
    return jsonify({"status": "ok"}), 200


@app.get("/health/ready")
def health_ready():
    vision_configured = bool(
        os.getenv("GOOGLE_API_KEY")
        or os.getenv("GEMINI_API_KEY")
        or os.getenv("GOOGLE_GENERATIVE_AI_API_KEY")
    )
    return jsonify({
        "status": "ready",
        "pipeline": {
            "native_pdf": True,
            "vision_gemini": vision_configured,
            "ocr_fallback": True,
        },
        "extraction_order": ["native_pdf", "vision_gemini", "ocr_fallback"],
    }), 200


# ---------------------------------------------------------------------------
# V2 API — new clean pipeline
# ---------------------------------------------------------------------------

@app.post("/v2/extract")
def v2_extract():
    """
    STEP 1-5 extraction only (no invoice PDF generation).

    Returns the NormalizedInvoice structure.
    The caller decides whether to render an invoice from it.
    """
    temp_path = None
    run_id = str(uuid.uuid4())

    try:
        print("V2 EXTRACT HIT")
        body = request.get_json(silent=True) or {}

        if "file" in request.files:
            temp_path = _save_upload(request.files["file"])
            pdf_path = temp_path
        else:
            pdf_path = body.get("pdf_path")

        if not pdf_path:
            return jsonify(err("pdf_path or file is required")), 400
        if not os.path.exists(pdf_path):
            return jsonify(err("pdf_path does not exist", pdf_path)), 400

        invoice: NormalizedInvoice = run_extraction_pipeline(
            pdf_path=pdf_path,
            run_id=run_id,
        )

        return jsonify(ok(
            invoice.to_dict(),
            run_id=run_id,
        )), 200

    except Exception as exc:
        logger.exception("v2/extract failed")
        return jsonify(err(str(exc))), 500

    finally:
        if temp_path and os.path.exists(temp_path):
            os.remove(temp_path)


@app.post("/v2/generate-invoice")
def v2_generate_invoice():
    """
    Full pipeline: extract → validate → generate invoice PDF.

    The invoice renderer only receives the NormalizedInvoice.
    It does not know the extraction source.
    """
    temp_path = None
    run_id = str(uuid.uuid4())

    try:
        body = request.get_json(silent=True) or {}

        if "file" in request.files:
            temp_path = _save_upload(request.files["file"])
            pdf_path = temp_path
        else:
            pdf_path = body.get("pdf_path")

        if not pdf_path:
            return jsonify(err("pdf_path or file is required")), 400
        if not os.path.exists(pdf_path):
            return jsonify(err("pdf_path does not exist", pdf_path)), 400

        company_data = body.get("company_data") or {}

        # Run the extraction pipeline
        invoice: NormalizedInvoice = run_extraction_pipeline(
            pdf_path=pdf_path,
            run_id=run_id,
        )

        if not invoice.is_valid:
            return jsonify(err(
                "Extraction produced no valid invoice rows",
                {
                    "error": invoice.error,
                    "extraction_source": invoice.extraction_source,
                    "warnings": invoice.warnings[:10],
                },
            )), 422

        # Build ExtractionResult for the existing renderer
        # (bridge between new pipeline and existing generator)
        extraction_result = _normalized_to_extraction_result(invoice, company_data)
        profile = CompanyProfile.from_dict(company_data)

        invoice_path = generate_invoice_pdf(
            output_dir=str(_OUTPUT_DIR),
            result=extraction_result,
            profile=profile,
            template_path=body.get("template_path"),
            signature_path=body.get("signature_path"),
            stamp_path=body.get("stamp_path"),
            include_signature=_parse_bool(body.get("include_signature"), True),
            include_stamp=_parse_bool(body.get("include_stamp"), True),
            run_id=run_id,
            source_pdf_path=pdf_path,
        )

        return jsonify(ok(
            invoice.to_dict(),
            invoice_path=invoice_path,
            run_id=run_id,
        )), 201

    except Exception as exc:
        logger.exception("v2/generate-invoice failed")
        return jsonify(err(str(exc))), 500

    finally:
        if temp_path and os.path.exists(temp_path):
            os.remove(temp_path)


@app.post("/v2/generate-invoice/upload")
def v2_generate_invoice_upload():
    """Multipart form upload version of v2/generate-invoice."""
    temp_files = []
    run_id = str(uuid.uuid4())

    try:
        if "file" not in request.files:
            return jsonify(err("file field is required")), 400

        pdf_path = _save_upload(request.files["file"])
        temp_files.append(pdf_path)

        company_raw = _json.loads(request.form.get("company_data") or "{}")

        invoice: NormalizedInvoice = run_extraction_pipeline(
            pdf_path=pdf_path,
            run_id=run_id,
        )

        if not invoice.is_valid:
            return jsonify(err(
                "Extraction produced no valid invoice rows",
                {"warnings": invoice.warnings[:10]},
            )), 422

        extraction_result = _normalized_to_extraction_result(invoice, company_raw)
        profile = CompanyProfile.from_dict(company_raw)

        def _save_opt(field, prefix):
            if field in request.files:
                p = str(_UPLOAD_DIR / f"{prefix}_{request.files[field].filename}")
                request.files[field].save(p)
                temp_files.append(p)
                return p
            return None

        invoice_path = generate_invoice_pdf(
            output_dir=str(_OUTPUT_DIR),
            result=extraction_result,
            profile=profile,
            template_path=_save_opt("template", "tpl"),
            signature_path=_save_opt("signature", "sig"),
            stamp_path=_save_opt("stamp", "stmp"),
            include_signature=request.form.get("include_signature", "true").lower() == "true",
            include_stamp=request.form.get("include_stamp", "true").lower() == "true",
            run_id=run_id,
            source_pdf_path=pdf_path,
        )

        return jsonify(ok(
            invoice.to_dict(),
            invoice_path=invoice_path,
            run_id=run_id,
        )), 201

    except Exception as exc:
        logger.exception("v2/generate-invoice/upload failed")
        return jsonify(err(str(exc))), 500

    finally:
        for p in temp_files:
            try:
                if os.path.exists(p):
                    os.remove(p)
            except Exception:
                pass


# ---------------------------------------------------------------------------
# Draft workflow
# ---------------------------------------------------------------------------

@app.post("/v2/invoice/draft")
def invoice_draft():
    """
    Extract a PDF into an editable invoice draft.
    No PDF is rendered.
    """
    temp_path = None

    try:
        body = request.get_json(silent=True) or {}

        if "file" in request.files:
            temp_path = _save_upload(request.files["file"])
            pdf_path = temp_path
            # request.get_json() returns nothing for a multipart body - its
            # fields live in request.form instead. Without this, vat_rate
            # was silently always None whenever the caller sent a file
            # instead of a JSON pdf_path.
            vat_rate_raw = request.form.get("vat_rate")
        else:
            pdf_path = body.get("pdf_path")
            vat_rate_raw = body.get("vat_rate")

        if not pdf_path:
            return jsonify(err("pdf_path is required")), 400

        if not os.path.exists(pdf_path):
            return jsonify(err("pdf_path does not exist", pdf_path)), 400

        invoice = run_extraction_pipeline(
            pdf_path=pdf_path,
            run_id=str(uuid.uuid4()),
        )

        # An explicit VAT rate from the request (e.g. the wizard's own VAT
        # field) takes priority over whatever the extractor could infer from
        # the document, or its own hardcoded fallback.
        vat_rate_override = vat_rate_raw
        try:
            vat_rate_override = float(vat_rate_override) if vat_rate_override is not None else None
        except (TypeError, ValueError):
            vat_rate_override = None

        draft = build_draft(invoice, vat_rate_override=vat_rate_override)

        return jsonify(ok(draft)), 200

    except Exception as exc:
        logger.exception("invoice draft failed")
        return jsonify(err(str(exc))), 500

    finally:
        if temp_path and os.path.exists(temp_path):
            os.remove(temp_path)


@app.post("/v2/invoice/recompute")
def invoice_recompute():
    """
    User edited the draft.
    Recalculate totals using the AI draft engine.
    """

    try:
        body = request.get_json(silent=True) or {}

        draft = body.get("draft")

        if draft is None:
            return jsonify(err("draft is required")), 400

        updated = recompute(draft)

        validation = validate_draft(updated)

        if isinstance(validation, dict):
            updated["blocking_issues"] = validation.get("blocking_issues", [])
            updated["warnings"] = validation.get("warnings", [])

        return jsonify(ok(updated)), 200

    except Exception as exc:
        logger.exception("invoice recompute failed")
        return jsonify(err(str(exc))), 500


@app.post("/v2/invoice/render")
def invoice_render():
    """
    Render an approved draft directly to PDF.
    No extraction is run again.
    """

    try:
        body = request.get_json(silent=True) or {}

        draft = body.get("draft")

        if draft is None:
            return jsonify(err("draft is required")), 400

        # The client's totals are never trusted for what gets printed or
        # persisted - recompute here before validating or rendering. This
        # also fixes a real bug: without it, the response below carried no
        # totals/meta at all, so the Node backend that reads response.data
        # for the invoice fields was writing 0.00 subtotal/vat/net and a
        # placeholder client name to Mongo on every approval.
        draft = recompute(draft)

        blocking = validate_draft(draft)
        if blocking:
            return jsonify(err("Draft is not ready to render", {"issues": blocking})), 422

        company_data = body.get("company_data") or {}

        profile = CompanyProfile.from_dict(company_data)

        extraction_result = draft_to_extraction_result(draft)

        invoice_path = generate_invoice_pdf(
            output_dir=str(_OUTPUT_DIR),
            result=extraction_result,
            profile=profile,
            template_path=body.get("template_path"),
            signature_path=body.get("signature_path"),
            stamp_path=body.get("stamp_path"),
            include_signature=_parse_bool(
                body.get("include_signature"),
                True,
            ),
            include_stamp=_parse_bool(
                body.get("include_stamp"),
                True,
            ),
            run_id=str(uuid.uuid4()),
            source_pdf_path=body.get("source_pdf_path"),
        )

        # `draft` (which now carries the recomputed totals/meta/rows) goes in
        # `data`; `invoice_path` is a top-level extra field - Node's
        # approveInvoiceDraft reads `response.data` for the invoice fields
        # and `response.invoice_path` for the PDF location, so both need to
        # be present in this exact shape.
        return jsonify(ok(draft, invoice_path=invoice_path)), 200

    except Exception as exc:
        logger.exception("invoice render failed")
        return jsonify(err(str(exc))), 500


# ---------------------------------------------------------------------------
# Bridge: NormalizedInvoice → ExtractionResult (for existing renderer)
# ---------------------------------------------------------------------------

def _normalized_to_extraction_result(invoice: NormalizedInvoice, company_data: dict):
    """
    Convert NormalizedInvoice to ExtractionResult so the existing
    invoice renderer (generate_invoice_pdf) can consume it unchanged.

    This is the ONLY place that knows about both structures.
    The renderer itself is untouched.
    """
    from schema import (
        ExtractionResult, InvoiceFinancials, InvoiceLayout,
        InvoiceRow, TimesheetFormat, TimesheetMetadata,
    )
    from invoice_grouper import group_rows_for_invoice

    grouped_rows = group_rows_for_invoice(invoice.invoice_rows)

    rows = []
    for trade_group in grouped_rows:
        inv_row = InvoiceRow(
            trade=trade_group.trade,
            hours=trade_group.total_hours,
            rate=trade_group.blended_rate,
            amount=trade_group.total_amount,
            project_id=trade_group.project_id or None,
            employee_id=";".join(trade_group.source_employee_ids) or None,
        )
        inv_row.compute_vat(invoice.vat_rate)
        rows.append(inv_row)

    fin = InvoiceFinancials(
        subtotal=invoice.subtotal,
        total_deduction=invoice.deductions,
        deduction_vat=round(invoice.deductions * invoice.vat_rate, 3),
        adjusted_subtotal=max(0.0, invoice.subtotal - invoice.deductions),
        total_vat=invoice.vat,
        gross_total=invoice.gross_total,
        net_payable=invoice.net_total,
        deduction_source=invoice.extraction_source,
        summary_detected=True,
        deduction_breakdown=invoice.deduction_detail.breakdown if invoice.deduction_detail else {},
    )
    fin.deduction_total_with_vat = round(
        invoice.deductions + round(invoice.deductions * invoice.vat_rate, 3), 3
    )

    meta = TimesheetMetadata(
        client_name=invoice.client_name or None,
        client_trn=invoice.client_trn or None,
        period_month=invoice.period_month or None,
        source_invoice_no=invoice.invoice_no or None,
    )

    has_project = any(r.project_id for r in rows)
    layout = InvoiceLayout.PROJECT_BASED if has_project else InvoiceLayout.EMPLOYEE_BASED

    return ExtractionResult(
        success=invoice.is_valid,
        format=TimesheetFormat.GENERIC,
        layout=layout,
        rows=rows,
        financials=fin,
        metadata=meta,
        confidence=invoice.confidence,
        used_ocr=invoice.extraction_source in {"ocr", "hybrid"},
        used_vision=invoice.extraction_source in {"vision", "hybrid"},
        raw_text="",
        warnings=invoice.warnings,
        error=invoice.error,
    )


# ---------------------------------------------------------------------------
# Legacy V1 endpoints (preserved for backward compatibility)
# ---------------------------------------------------------------------------

def _run_service_extraction(**kwargs):
    result = run_extraction(**kwargs)
    try:
        return apply_semantic_overlay_to_result(result)
    except Exception as exc:
        logger.warning("semantic overlay skipped: %s", exc)
        result.warnings.append("semantic_skipped:error")
        return result


@app.post("/extract")
def extract():
    """Legacy V1 endpoint — uses old pipeline. Use /v2/extract for new pipeline."""
    temp_path = None
    stage_started = stage_start(logger, "upload_ingestion", endpoint="/extract")
    try:
        body = request.get_json(silent=True) or {}
        run_id = body.get("run_id") or str(uuid.uuid4())

        if "file" in request.files:
            temp_path = _save_upload(request.files["file"])
            pdf_path = temp_path
        else:
            pdf_path = body.get("pdf_path")

        if not pdf_path:
            return jsonify(err("pdf_path or file is required")), 400
        if not os.path.exists(pdf_path):
            return jsonify(err("pdf_path does not exist", pdf_path)), 400

        profile = None
        if body.get("company_data"):
            profile = CompanyProfile.from_dict(body.get("company_data") or {})

        result = _run_service_extraction(
            pdf_path=pdf_path,
            company_profile=profile,
            debug_mode=_parse_bool(body.get("debug_mode"), False),
            run_id=run_id,
        )

        stage_complete(logger, "upload_ingestion", stage_started, endpoint="/extract")
        return jsonify(ok(result.to_dict(), run_id=run_id, quality_score=score_extraction(result))), 200

    except Exception as exc:
        stage_failure(logger, "upload_ingestion", stage_started, exc, failure_category=classify_failure(exc))
        logger.exception("extract failed")
        return jsonify(err(str(exc))), 500

    finally:
        if temp_path and os.path.exists(temp_path):
            os.remove(temp_path)


@app.get("/download-invoice/<filename>")
def download_invoice(filename: str):
    # Closure-pass finding: this previously joined the raw path segment
    # straight onto _OUTPUT_DIR with no sanitization. Flask's default
    # <filename> converter forbids '/' in the segment, so a full multi-hop
    # ../../../etc/passwd style traversal isn't reachable via the URL - but
    # a bare '..' is a valid single segment and Path(_OUTPUT_DIR) / '..'
    # resolves one level up to the shared OS temp root, which is a real,
    # confirmed traversal (reproduced with the Flask test client). Only
    # caller today is invoiceDraft.service.js (server-to-server, gated by
    # the shared-secret check above), but this is still the same
    # trust-nothing-twice defense-in-depth this codebase already applies
    # everywhere else a stored/generated path is resolved (see
    # backend/src/services/storage.service.js's keyToLocalAbsolutePath).
    # secure_filename() strips '..'/'/' entirely; the resolved-path
    # containment check below is a second, independent guard against any
    # future change to that helper's behavior.
    safe_name = secure_filename(filename)
    if not safe_name:
        return jsonify(err("Invalid filename")), 400
    path = (_OUTPUT_DIR / safe_name).resolve()
    output_root = _OUTPUT_DIR.resolve()
    if path != output_root and output_root not in path.parents:
        return jsonify(err("Invalid filename")), 400
    if not path.exists():
        return jsonify(err("File not found")), 404
    return send_file(str(path), mimetype="application/pdf", as_attachment=True, download_name=safe_name)

@app.route("/debug", methods=["GET"])
def debug():
    # This leaks server filesystem paths and has no authentication of its
    # own (this service has no auth layer at all) - disabled by default,
    # only reachable if explicitly opted into for local/dev debugging.
    if os.getenv("AI_SERVICE_ENABLE_DEBUG_ENDPOINT", "").strip().lower() != "true":
        return jsonify(err("Not found")), 404
    return {
        "cwd": os.getcwd(),
        "file": __file__,
    }


@app.get("/capabilities")
def capabilities():
    vision_configured = bool(
        os.getenv("GOOGLE_API_KEY")
        or os.getenv("GEMINI_API_KEY")
    )
    return jsonify({
        "status": "ok",
        "pipeline_version": "v2",
        "extraction_order": ["native_pdf", "vision_gemini", "ocr_fallback"],
        "vision_configured": vision_configured,
        "supported_formats": [
            "digital_pdf", "scanned_pdf", "image_pdf", "mixed_pdf",
        ],
        "supported_documents": [
            "construction_timesheets", "attendance_sheets", "payroll_sheets",
            "labor_reports", "contractor_billing_sheets",
        ],
        "generalizes_to_unknown_formats": True,
    }), 200

print("=" * 80)
print("REGISTERED ROUTES")
for rule in app.url_map.iter_rules():
    print(rule)
print("=" * 80)

if __name__ == "__main__":
    port = _to_int(os.getenv("PORT"), 8001, minimum=1)
    app.run(debug=False, use_reloader=False, port=port, host="0.0.0.0")