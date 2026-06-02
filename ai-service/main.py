"""
main.py

Flask API for:
- OCR invoice extraction
- Timesheet processing
- Tax invoice generation

Uses:
- RapidOCR
- OpenCV
- Offline extraction only
"""

from __future__ import annotations

import json as _json
import logging
import os
import tempfile
import uuid

from pathlib import Path

from dotenv import load_dotenv

from flask import (
    Flask,
    jsonify,
    request,
    send_file,
)

from flask_cors import CORS

from contracts import err, ok

from pipeline import run_extraction
import pipeline.run as _run_mod

from generator import generate_invoice_pdf
import pipeline.text_extractor as _text_extractor_mod
import pipeline.deduction_parser as _deduction_parser_mod
import generator.templates.compact_single_page_engine as _compact_engine_mod

from schema import (
    CompanyProfile,
    validate_extraction,
)

from validation import score_extraction

# ---------------------------------------------------------------------------
# setup
# ---------------------------------------------------------------------------

load_dotenv()

app = Flask(__name__)

CORS(app)

logging.basicConfig(level=logging.INFO)

logger = logging.getLogger(__name__)

logger.info("runtime_import module=text_extractor file=%s", getattr(_text_extractor_mod, "__file__", ""))
logger.info("runtime_import module=deduction_parser file=%s", getattr(_deduction_parser_mod, "__file__", ""))
logger.info("runtime_import module=compact_single_page_engine file=%s", getattr(_compact_engine_mod, "__file__", ""))
logger.info("runtime_import module=run file=%s", getattr(_run_mod, "__file__", ""))

_backend_renderer_path = (
    Path(__file__).resolve().parent.parent
    / "backend"
    / "src"
    / "services"
    / "invoiceRenderer.service.js"
)
logger.info(
    "runtime_import module=invoice_renderer_backend file=%s exists=%s",
    str(_backend_renderer_path),
    _backend_renderer_path.exists(),
)

_UPLOAD_DIR = (
    Path(tempfile.gettempdir())
    / "ai-invoice-uploads"
)

_OUTPUT_DIR = (
    Path(tempfile.gettempdir())
    / "ai-invoice-outputs"
)

_UPLOAD_DIR.mkdir(
    parents=True,
    exist_ok=True,
)

_OUTPUT_DIR.mkdir(
    parents=True,
    exist_ok=True,
)

# ---------------------------------------------------------------------------
# helpers
# ---------------------------------------------------------------------------

def _parse_bool(value, default=True):

    if isinstance(value, bool):
        return value

    if isinstance(value, str):

        lowered = value.strip().lower()

        if lowered == "true":
            return True

        if lowered == "false":
            return False

    if isinstance(value, (int, float)):

        if value == 1:
            return True

        if value == 0:
            return False

    return default


def _save_upload(file_obj):

    name = file_obj.filename or "upload.pdf"

    path = _UPLOAD_DIR / name

    file_obj.save(str(path))

    return str(path)


# ---------------------------------------------------------------------------
# health
# ---------------------------------------------------------------------------

@app.get("/health")
def health():

    return jsonify({
        "status": "ok",
    }), 200


# ---------------------------------------------------------------------------
# capabilities
# ---------------------------------------------------------------------------

@app.get("/capabilities")
def capabilities():

    return jsonify({
        "status": "ok",
        "ocr": True,
        "opencv": True,
        "extraction": [
            "mcc",
            "bkc",
            "generic",
        ],
        "generation": [
            "project_based",
            "employee_based",
        ],
    }), 200


# ---------------------------------------------------------------------------
# extract
# ---------------------------------------------------------------------------

@app.post("/extract")
def extract():

    temp_path = None

    try:

        body = request.get_json(silent=True) or {}
        debug_mode = _parse_bool(body.get("debug_mode"), False)
        run_id = body.get("run_id") or str(uuid.uuid4())

        # ---------------------------------------------------------------
        # upload handling
        # ---------------------------------------------------------------

        if "file" in request.files:

            temp_path = _save_upload(
                request.files["file"]
            )

            pdf_path = temp_path

        else:

            pdf_path = body.get("pdf_path")

        if not pdf_path:

            return jsonify(
                err("pdf_path or file is required")
            ), 400

        if not os.path.exists(pdf_path):

            return jsonify(
                err(
                    "pdf_path does not exist",
                    pdf_path,
                )
            ), 400

        # ---------------------------------------------------------------
        # company profile
        # ---------------------------------------------------------------

        profile = None

        if body.get("company_data"):

            profile = CompanyProfile.from_dict(
                body.get("company_data") or {}
            )

        # ---------------------------------------------------------------
        # extraction
        # ---------------------------------------------------------------

        result = run_extraction(
            pdf_path=pdf_path,
            company_profile=profile,
            debug_mode=debug_mode,
            run_id=run_id,
        )

        response = ok(
            result.to_dict(),
            run_id=run_id,
            quality_score=score_extraction(result),
        )

        if debug_mode:
            debug_path = None
            for warning in result.warnings:
                if str(warning).startswith("debug_report:"):
                    debug_path = str(warning).split(":", 1)[1]
                    break

            debug_payload = {
                "debug_report_path": debug_path,
                "confidence_breakdown": {},
                "attendance_validation": [],
                "extracted_cells": [],
                "reconstructed_grid": [],
            }

            if debug_path and os.path.exists(debug_path):
                try:
                    with open(debug_path, "r", encoding="utf-8") as fh:
                        loaded = _json.load(fh)

                    debug_payload["confidence_breakdown"] = loaded.get("confidence_breakdown") or {}
                    debug_payload["attendance_validation"] = loaded.get("attendance_validation") or []

                    table_engine = loaded.get("table_engine") or {}
                    table_items = table_engine.get("tables") or []
                    debug_payload["reconstructed_grid"] = [
                        {
                            "page": t.get("page"),
                            "table": t.get("table"),
                            "row_boundaries": t.get("row_boundaries") or [],
                            "col_boundaries": t.get("col_boundaries") or [],
                        }
                        for t in table_items
                    ]

                    extracted_cells = []
                    for t in table_items:
                        extracted_cells.extend(t.get("cells") or [])
                    debug_payload["extracted_cells"] = extracted_cells
                except Exception:
                    pass

            response["debug"] = debug_payload

        return jsonify(response), 200

    except Exception as exc:

        logger.exception("extract failed")

        return jsonify(
            err(str(exc))
        ), 500

    finally:

        if temp_path and os.path.exists(temp_path):

            os.remove(temp_path)


# ---------------------------------------------------------------------------
# generate invoice
# ---------------------------------------------------------------------------

@app.post("/generate-invoice")
def generate_invoice():

    temp_path = None

    try:

        body = request.get_json(silent=True) or {}
        run_id = body.get("run_id") or str(uuid.uuid4())

        pdf_path = body.get("pdf_path")

        if not pdf_path:

            return jsonify(
                err("pdf_path is required")
            ), 400

        if not os.path.exists(pdf_path):

            return jsonify(
                err(
                    "pdf_path does not exist",
                    pdf_path,
                )
            ), 400

        # ---------------------------------------------------------------
        # profile
        # ---------------------------------------------------------------

        profile = CompanyProfile.from_dict(
            body.get("company_data") or {}
        )

        # ---------------------------------------------------------------
        # extraction
        # ---------------------------------------------------------------

        result = run_extraction(
            pdf_path=pdf_path,
            company_profile=profile,
            run_id=run_id,
        )

        if not validate_extraction(result):

            return jsonify(
                err(
                    "Extraction failed or produced no valid rows",
                    result.warnings,
                )
            ), 422

        # ---------------------------------------------------------------
        # invoice generation
        # ---------------------------------------------------------------

        invoice_path = generate_invoice_pdf(
            output_dir=str(_OUTPUT_DIR),
            result=result,
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
            run_id=run_id,
            source_pdf_path=pdf_path,
        )

        return jsonify(
            ok(
                result.to_dict(),
                invoice_path=invoice_path,
                run_id=run_id,
                quality_score=score_extraction(result),
            )
        ), 201

    except Exception as exc:

        logger.exception(
            "generate-invoice failed"
        )

        return jsonify(
            err(str(exc))
        ), 500

    finally:

        if temp_path and os.path.exists(temp_path):

            os.remove(temp_path)


# ---------------------------------------------------------------------------
# upload invoice generation
# ---------------------------------------------------------------------------

@app.post("/generate-invoice/upload")
def generate_invoice_upload():

    temp_files = []

    try:
        run_id = request.form.get("run_id") or str(uuid.uuid4())

        if "file" not in request.files:

            return jsonify(
                err("file field is required")
            ), 400

        pdf_path = _save_upload(
            request.files["file"]
        )

        temp_files.append(pdf_path)

        company_raw = _json.loads(
            request.form.get("company_data") or "{}"
        )

        profile = CompanyProfile.from_dict(
            company_raw
        )

        def _save_opt(field, prefix):

            if field in request.files:

                p = str(
                    _UPLOAD_DIR
                    / f"{prefix}_{request.files[field].filename}"
                )

                request.files[field].save(p)

                temp_files.append(p)

                return p

            return None

        # ---------------------------------------------------------------
        # extraction
        # ---------------------------------------------------------------

        result = run_extraction(
            pdf_path=pdf_path,
            company_profile=profile,
            run_id=run_id,
        )

        if not validate_extraction(result):

            return jsonify(
                err(
                    "Extraction produced no valid rows",
                    result.warnings,
                )
            ), 422

        # ---------------------------------------------------------------
        # generate invoice
        # ---------------------------------------------------------------

        invoice_path = generate_invoice_pdf(
            output_dir=str(_OUTPUT_DIR),
            result=result,
            profile=profile,
            template_path=_save_opt("template", "tpl"),
            signature_path=_save_opt("signature", "sig"),
            stamp_path=_save_opt("stamp", "stmp"),
            include_signature=request.form.get(
                "include_signature",
                "true",
            ).lower() == "true",
            include_stamp=request.form.get(
                "include_stamp",
                "true",
            ).lower() == "true",
            run_id=run_id,
            source_pdf_path=pdf_path,
        )

        return jsonify(
            ok(
                result.to_dict(),
                invoice_path=invoice_path,
                run_id=run_id,
                quality_score=score_extraction(result),
            )
        ), 201

    except Exception as exc:

        logger.exception(
            "generate-invoice/upload failed"
        )

        return jsonify(
            err(str(exc))
        ), 500

    finally:

        for p in temp_files:

            try:

                if os.path.exists(p):
                    os.remove(p)

            except Exception:
                pass


# ---------------------------------------------------------------------------
# download invoice
# ---------------------------------------------------------------------------

@app.get("/download-invoice/<filename>")
def download_invoice(filename: str):

    path = _OUTPUT_DIR / filename

    if not path.exists():

        return jsonify(
            err("File not found")
        ), 404

    return send_file(
        str(path),
        mimetype="application/pdf",
        as_attachment=True,
        download_name=filename,
    )


# ---------------------------------------------------------------------------
# run
# ---------------------------------------------------------------------------

if __name__ == "__main__":

    port = int(
        os.getenv("PORT", 8001)
    )

    app.run(
        debug=False,
        use_reloader=False,
        port=port,
        host="0.0.0.0",
    )