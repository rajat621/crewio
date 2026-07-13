# """
# main.py

# Flask API for:
# - OCR invoice extraction
# - Timesheet processing
# - Tax invoice generation

# Uses:
# - RapidOCR
# - OpenCV
# - Offline extraction only
# """

# from __future__ import annotations

# import json as _json
# import logging
# import os
# import tempfile
# import uuid
# from concurrent.futures import ThreadPoolExecutor, TimeoutError as FutureTimeoutError

# from pathlib import Path

# from dotenv import load_dotenv

# load_dotenv()

# from flask import (
#     Flask,
#     g,
#     jsonify,
#     request,
#     send_file,
# )

# from flask_cors import CORS

# from contracts import err, ok

# from pipeline import run_extraction
# import pipeline.run as _run_mod
# from extractor import apply_semantic_overlay_to_result

# from generator import generate_invoice_pdf
# import pipeline.text_extractor as _text_extractor_mod
# import pipeline.deduction_parser as _deduction_parser_mod
# import generator.templates.compact_single_page_engine as _compact_engine_mod

# from schema import (
#     CompanyProfile,
#     validate_extraction,
# )

# from validation import score_extraction
# from config_runtime import CONFIG
# from pipeline.structured_logging import (
#     classify_failure,
#     log_event,
#     set_trace_context,
#     stage_complete,
#     stage_failure,
#     stage_start,
# )

# app = Flask(__name__)

# CORS(app)

# logging.basicConfig(level=logging.INFO)

# logger = logging.getLogger(__name__)

# _RENDER_EXECUTOR = ThreadPoolExecutor(max_workers=1, thread_name_prefix="pdf-render")

# logger.info("runtime_import module=text_extractor file=%s", getattr(_text_extractor_mod, "__file__", ""))


# def _run_service_extraction(**kwargs):
#     result = run_extraction(**kwargs)
#     try:
#         return apply_semantic_overlay_to_result(result)
#     except Exception as exc:
#         logger.warning("semantic overlay skipped: %s", exc)
#         result.warnings.append("semantic_skipped:error")
#         return result
# logger.info("runtime_import module=deduction_parser file=%s", getattr(_deduction_parser_mod, "__file__", ""))
# logger.info("runtime_import module=compact_single_page_engine file=%s", getattr(_compact_engine_mod, "__file__", ""))
# logger.info("runtime_import module=run file=%s", getattr(_run_mod, "__file__", ""))

# # Startup visibility and strict provider validation
# from providers import vision_llm as _vision_llm_mod
# from providers import ocr as _ocr_mod

# def _log_startup_and_validate():
#     try:
#         vp = str(CONFIG.providers.vision_provider or '').strip().lower()
#         vm = CONFIG.providers.vision_model
#         ocrp = str(CONFIG.providers.ocr_provider or 'paddleocr').strip()

#         # Log configured providers and timeouts
#         logger.info('Vision Provider : %s', CONFIG.providers.vision_provider)
#         logger.info('Vision Model    : %s', vm)
#         logger.info('OCR Provider    : %s', ocrp)
#         logger.info('Timeouts: provider=%d ms backend_request=%d ms worker=%d ms',
#                     CONFIG.timeouts.provider_timeout_ms,
#                     CONFIG.timeouts.backend_request_timeout_ms,
#                     CONFIG.timeouts.worker_timeout_ms)

#         # Validate vision configuration strictly when enabled
#         if CONFIG.feature_flags.enable_vision:
#             # Environment-level validation
#             missing_envs = []
#             if not os.getenv('VISION_PROVIDER'):
#                 missing_envs.append('VISION_PROVIDER')
#             if not os.getenv('VISION_MODEL'):
#                 missing_envs.append('VISION_MODEL')
#             if not os.getenv('AI_SERVICE_TIMEOUT_MS'):
#                 missing_envs.append('AI_SERVICE_TIMEOUT_MS')
#             if not os.getenv('PROVIDER_TIMEOUT_MS'):
#                 missing_envs.append('PROVIDER_TIMEOUT_MS')
#             if missing_envs:
#                 logger.error('Missing required environment variables for vision mode: %s', ','.join(missing_envs))
#                 raise SystemExit(f'Missing required env vars: {missing_envs}')

#             if vp in {'gemini', 'google', 'google_gemini'}:
#                 # Attempt to construct Gemini provider now; fail fast if API key missing
#                 try:
#                     prov = _vision_llm_mod.GeminiVisionProvider()
#                 except Exception as exc:
#                     logger.exception('Vision provider initialization failed')
#                     raise SystemExit(f'Gemini vision provider failed to initialize: {exc}')
#             elif vp == 'ollama' or vp == '' or vp is None:
#                 # If Ollama is configured (explicitly), allow its init but do not silently switch
#                 try:
#                     prov = _vision_llm_mod.OllamaVisionProvider()
#                 except Exception as exc:
#                     logger.exception('Ollama vision provider failed to initialize')
#                     raise SystemExit(f'Ollama vision provider failed to initialize: {exc}')
#             else:
#                 logger.error('Unsupported VISION_PROVIDER configured: %s', CONFIG.providers.vision_provider)
#                 raise SystemExit(f'Unsupported VISION_PROVIDER: {CONFIG.providers.vision_provider}')

#         # Log OCR provider initialization count if possible
#         try:
#             logger.info('OCR Provider module: %s', getattr(_ocr_mod, '__name__', 'ocr'))
#         except Exception:
#             pass

#     except SystemExit:
#         raise
#     except Exception:
#         logger.exception('Startup provider validation failed; aborting startup')
#         raise SystemExit('Startup validation failed')


# _log_startup_and_validate()

# _backend_renderer_path = (
#     Path(__file__).resolve().parent.parent
#     / "backend"
#     / "src"
#     / "services"
#     / "invoiceRenderer.service.js"
# )
# logger.info(
#     "runtime_import module=invoice_renderer_backend file=%s exists=%s",
#     str(_backend_renderer_path),
#     _backend_renderer_path.exists(),
# )

# _UPLOAD_DIR = (
#     Path(tempfile.gettempdir())
#     / "ai-invoice-uploads"
# )

# _OUTPUT_DIR = (
#     Path(tempfile.gettempdir())
#     / "ai-invoice-outputs"
# )

# _UPLOAD_DIR.mkdir(
#     parents=True,
#     exist_ok=True,
# )

# _OUTPUT_DIR.mkdir(
#     parents=True,
#     exist_ok=True,
# )

# # ---------------------------------------------------------------------------
# # helpers
# # ---------------------------------------------------------------------------

# def _parse_bool(value, default=True):

#     if isinstance(value, bool):
#         return value

#     if isinstance(value, str):

#         lowered = value.strip().lower()

#         if lowered == "true":
#             return True

#         if lowered == "false":
#             return False

#     if isinstance(value, (int, float)):

#         if value == 1:
#             return True

#         if value == 0:
#             return False

#     return default


# def _save_upload(file_obj):

#     name = file_obj.filename or "upload.pdf"

#     path = _UPLOAD_DIR / name

#     file_obj.save(str(path))

#     return str(path)


# def _render_pdf_isolated(**kwargs) -> str:
#     render_timeout_ms = int(os.getenv("PDF_RENDER_TIMEOUT_MS", str(CONFIG.timeouts.worker_timeout_ms)))
#     future = _RENDER_EXECUTOR.submit(generate_invoice_pdf, **kwargs)
#     try:
#         return future.result(timeout=max(1.0, float(render_timeout_ms) / 1000.0))
#     except FutureTimeoutError as exc:
#         raise RuntimeError("PDF_RENDER_TIMEOUT") from exc


# @app.before_request
# def _init_trace_context():
#     request_id = request.headers.get("x-request-id") or str(uuid.uuid4())
#     trace_id = request.headers.get("x-trace-id") or str(uuid.uuid4())
#     g.request_id = request_id
#     g.trace_id = trace_id
#     set_trace_context(request_id=request_id, trace_id=trace_id)


# @app.after_request
# def _set_trace_headers(response):
#     response.headers["x-request-id"] = getattr(g, "request_id", "")
#     response.headers["x-trace-id"] = getattr(g, "trace_id", "")
#     return response


# # ---------------------------------------------------------------------------
# # health
# # ---------------------------------------------------------------------------
# @app.get("/")
# def root():
#     return jsonify({
#         "status": "ok",
#         "service": "AI Service",
#         "message": "AI Service Running"
#     }), 200

# @app.get("/health")
# def health():

#     return jsonify({
#         "status": "ok",
#         "service": "ai-worker",
#     }), 200


# @app.get("/health/ready")
# def health_ready():
#     return jsonify({
#         "status": "ready",
#         "ocr": "paddle-or-rapidocr",
#         "llm": "ollama",
#         "feature_flags": {
#             "ENABLE_ASYNC_AI": CONFIG.feature_flags.enable_async_ai,
#             "ENABLE_OLLAMA": CONFIG.feature_flags.enable_ollama,
#             "ENABLE_VISION": CONFIG.feature_flags.enable_vision,
#             "ENABLE_SEMANTIC_EXTRACTION": CONFIG.feature_flags.enable_semantic_extraction,
#             "ENABLE_PADDLE_OCR": CONFIG.feature_flags.enable_paddle_ocr,
#         },
#     }), 200


# # ---------------------------------------------------------------------------
# # capabilities
# # ---------------------------------------------------------------------------

# @app.get("/capabilities")
# def capabilities():
#     return jsonify({
#         "status": "ok",
#         "ocr": True,
#         "ocr_provider": "paddleocr_with_rapidocr_fallback",
#         "opencv": True,
#         "llm": "ollama",
#         "model": CONFIG.providers.ollama_model,
#         "paid_api_required": False,
#         "extraction": [
#             "mcc",
#             "bkc",
#             "generic",
#         ],
#         "generation": [
#             "project_based",
#             "employee_based",
#         ],
#         "feature_flags": {
#             "ENABLE_ASYNC_AI": CONFIG.feature_flags.enable_async_ai,
#             "ENABLE_OLLAMA": CONFIG.feature_flags.enable_ollama,
#             "ENABLE_VISION": CONFIG.feature_flags.enable_vision,
#             "ENABLE_SEMANTIC_EXTRACTION": CONFIG.feature_flags.enable_semantic_extraction,
#             "ENABLE_PADDLE_OCR": CONFIG.feature_flags.enable_paddle_ocr,
#         },
#     }), 200


# # ---------------------------------------------------------------------------
# # extract
# # ---------------------------------------------------------------------------

# @app.post("/extract")
# def extract():

#     temp_path = None
#     stage_started = stage_start(logger, "upload_ingestion", endpoint="/extract")

#     try:

#         body = request.get_json(silent=True) or {}
#         debug_mode = _parse_bool(body.get("debug_mode"), False)
#         run_id = body.get("run_id") or str(uuid.uuid4())
#         set_trace_context(
#             request_id=getattr(g, "request_id", ""),
#             trace_id=getattr(g, "trace_id", ""),
#             run_id=run_id,
#         )

#         # ---------------------------------------------------------------
#         # upload handling
#         # ---------------------------------------------------------------

#         if "file" in request.files:

#             temp_path = _save_upload(
#                 request.files["file"]
#             )

#             pdf_path = temp_path

#         else:

#             pdf_path = body.get("pdf_path")

#         if not pdf_path:

#             return jsonify(
#                 err("pdf_path or file is required")
#             ), 400

#         if not os.path.exists(pdf_path):

#             return jsonify(
#                 err(
#                     "pdf_path does not exist",
#                     pdf_path,
#                 )
#             ), 400

#         # ---------------------------------------------------------------
#         # company profile
#         # ---------------------------------------------------------------

#         profile = None

#         if body.get("company_data"):

#             profile = CompanyProfile.from_dict(
#                 body.get("company_data") or {}
#             )

#         # ---------------------------------------------------------------
#         # extraction
#         # ---------------------------------------------------------------

#         result = _run_service_extraction(
#             pdf_path=pdf_path,
#             company_profile=profile,
#             debug_mode=debug_mode,
#             run_id=run_id,
#         )

#         stage_complete(
#             logger,
#             "upload_ingestion",
#             stage_started,
#             endpoint="/extract",
#             request_id=getattr(g, "request_id", ""),
#             trace_id=getattr(g, "trace_id", ""),
#             success=bool(result.success),
#         )

#         response = ok(
#             result.to_dict(),
#             run_id=run_id,
#             quality_score=score_extraction(result),
#         )

#         if debug_mode:
#             debug_path = None
#             for warning in result.warnings:
#                 if str(warning).startswith("debug_report:"):
#                     debug_path = str(warning).split(":", 1)[1]
#                     break

#             debug_payload = {
#                 "debug_report_path": debug_path,
#                 "confidence_breakdown": {},
#                 "attendance_validation": [],
#                 "extracted_cells": [],
#                 "reconstructed_grid": [],
#             }

#             if debug_path and os.path.exists(debug_path):
#                 try:
#                     with open(debug_path, "r", encoding="utf-8") as fh:
#                         loaded = _json.load(fh)

#                     debug_payload["confidence_breakdown"] = loaded.get("confidence_breakdown") or {}
#                     debug_payload["attendance_validation"] = loaded.get("attendance_validation") or []

#                     table_engine = loaded.get("table_engine") or {}
#                     table_items = table_engine.get("tables") or []
#                     debug_payload["reconstructed_grid"] = [
#                         {
#                             "page": t.get("page"),
#                             "table": t.get("table"),
#                             "row_boundaries": t.get("row_boundaries") or [],
#                             "col_boundaries": t.get("col_boundaries") or [],
#                         }
#                         for t in table_items
#                     ]

#                     extracted_cells = []
#                     for t in table_items:
#                         extracted_cells.extend(t.get("cells") or [])
#                     debug_payload["extracted_cells"] = extracted_cells
#                 except Exception:
#                     pass

#             response["debug"] = debug_payload

#         return jsonify(response), 200

#     except Exception as exc:
#         try:
#             stage_failure(
#                 logger,
#                 "upload_ingestion",
#                 stage_started,
#                 exc,
#                 endpoint="/extract",
#                 request_id=getattr(g, "request_id", ""),
#                 trace_id=getattr(g, "trace_id", ""),
#                 failure_category=classify_failure(exc),
#             )
#         except Exception:
#             logger.exception("stage_failure logging failed for /extract")

#         logger.exception("extract failed")

#         return jsonify(
#             err(str(exc))
#         ), 500

#     finally:

#         if temp_path and os.path.exists(temp_path):

#             os.remove(temp_path)


# @app.post("/extract/invoice-summary")
# def extract_invoice_summary():

#     try:
#         body = request.get_json(silent=True) or {}
#         pdf_path = body.get("pdf_path")
#         if not pdf_path:
#             return jsonify(err("pdf_path is required")), 400
#         if not os.path.exists(pdf_path):
#             return jsonify(err("pdf_path does not exist", pdf_path)), 400

#         result = _run_service_extraction(pdf_path=pdf_path)
#         rows = []
#         for idx, row in enumerate(result.rows, 1):
#             rows.append({
#                 "si_no": idx,
#                 "trade": row.trade,
#                 "project_id": row.project_id,
#                 "employee_id": row.employee_id,
#                 "hours": row.hours,
#                 "rate": row.rate,
#                 "amount": row.amount,
#                 "vat": row.vat_rate,
#                 "vat_amount": row.vat_amount,
#                 "net_amount": row.net_amount,
#             })

#         response = {
#             "success": result.success,
#             "document_type": "invoice_summary",
#             "metadata": result.to_dict().get("metadata", {}),
#             "invoice_summary": {
#                 "rows": rows,
#                 "totals": {
#                     "subtotal": result.financials.subtotal,
#                     "vat_total": result.financials.total_vat,
#                     "total_deduction": result.financials.total_deduction,
#                     "net_total": result.financials.net_payable,
#                 },
#             },
#             "attendance": {"rows": []},
#             "pipeline": {
#                 "used_ocr": result.used_ocr,
#                 "confidence": result.confidence,
#                 "best_table_type": "invoice_summary" if rows else "unknown",
#             },
#             "error": result.error,
#             "warnings": result.warnings,
#         }

#         status = 200 if result.success else 422
#         return jsonify(response), status
#     except Exception as exc:
#         logger.exception("extract/invoice-summary failed")
#         return jsonify(err(str(exc))), 500


# @app.post("/extract/attendance")
# def extract_attendance():

#     try:
#         body = request.get_json(silent=True) or {}
#         pdf_path = body.get("pdf_path")
#         if not pdf_path:
#             return jsonify(err("pdf_path is required")), 400
#         if not os.path.exists(pdf_path):
#             return jsonify(err("pdf_path does not exist", pdf_path)), 400

#         result = _run_service_extraction(pdf_path=pdf_path)
#         attendance_rows = []
#         for row in result.rows:
#             attendance_rows.append({
#                 "trade": row.trade,
#                 "project_id": row.project_id,
#                 "employee_id": row.employee_id,
#                 "hours": row.hours,
#                 "calculated_hours": row.calculated_hours,
#                 "hours_match": row.hours_match,
#                 "attendance_days": row.attendance_days,
#                 "overtime_hours": row.overtime_hours,
#             })

#         response = {
#             "success": result.success,
#             "document_type": "attendance",
#             "metadata": result.to_dict().get("metadata", {}),
#             "invoice_summary": {
#                 "rows": [],
#                 "totals": {
#                     "subtotal": result.financials.subtotal,
#                     "vat_total": result.financials.total_vat,
#                     "total_deduction": result.financials.total_deduction,
#                     "net_total": result.financials.net_payable,
#                 },
#             },
#             "attendance": {"rows": attendance_rows},
#             "pipeline": {
#                 "used_ocr": result.used_ocr,
#                 "confidence": result.confidence,
#                 "best_table_type": "attendance" if attendance_rows else "unknown",
#             },
#             "error": result.error,
#             "warnings": result.warnings,
#         }

#         status = 200 if result.success else 422
#         return jsonify(response), status
#     except Exception as exc:
#         logger.exception("extract/attendance failed")
#         return jsonify(err(str(exc))), 500


# # ---------------------------------------------------------------------------
# # generate invoice
# # ---------------------------------------------------------------------------

# @app.post("/generate-invoice")
# def generate_invoice():

#     temp_path = None
#     stage_started = stage_start(logger, "invoice_rendering", endpoint="/generate-invoice")

#     try:

#         body = request.get_json(silent=True) or {}
#         run_id = body.get("run_id") or str(uuid.uuid4())
#         set_trace_context(
#             request_id=getattr(g, "request_id", ""),
#             trace_id=getattr(g, "trace_id", ""),
#             run_id=run_id,
#         )

#         pdf_path = body.get("pdf_path")

#         if not pdf_path:

#             return jsonify(
#                 err("pdf_path is required")
#             ), 400

#         if not os.path.exists(pdf_path):

#             return jsonify(
#                 err(
#                     "pdf_path does not exist",
#                     pdf_path,
#                 )
#             ), 400

#         # ---------------------------------------------------------------
#         # profile
#         # ---------------------------------------------------------------

#         profile = CompanyProfile.from_dict(
#             body.get("company_data") or {}
#         )

#         # ---------------------------------------------------------------
#         # extraction
#         # ---------------------------------------------------------------

#         result = _run_service_extraction(
#             pdf_path=pdf_path,
#             company_profile=profile,
#             run_id=run_id,
#         )

#         if not validate_extraction(result):

#             return jsonify(
#                 err(
#                     "Extraction failed or produced no valid rows",
#                     result.warnings,
#                 )
#             ), 422

#         # ---------------------------------------------------------------
#         # invoice generation
#         # ---------------------------------------------------------------

#         try:
#             invoice_path = _render_pdf_isolated(
#                 output_dir=str(_OUTPUT_DIR),
#                 result=result,
#                 profile=profile,
#                 template_path=body.get("template_path"),
#                 signature_path=body.get("signature_path"),
#                 stamp_path=body.get("stamp_path"),
#                 include_signature=_parse_bool(
#                     body.get("include_signature"),
#                     True,
#                 ),
#                 include_stamp=_parse_bool(
#                     body.get("include_stamp"),
#                     True,
#                 ),
#                 run_id=run_id,
#                 source_pdf_path=pdf_path,
#             )
#         except RuntimeError as exc:
#             if str(exc) == "PDF_RENDER_TIMEOUT":
#                 result.warnings.append("review_recommended:render_timeout")
#                 log_event(
#                     logger,
#                     "timeout_degradation_activated",
#                     stage="invoice_rendering",
#                     run_id=run_id,
#                     endpoint="/generate-invoice",
#                 )
#                 return jsonify(
#                     ok(
#                         result.to_dict(),
#                         invoice_path=None,
#                         run_id=run_id,
#                         quality_score=score_extraction(result),
#                         review_recommended=True,
#                     )
#                 ), 202
#             raise

#         stage_complete(
#             logger,
#             "invoice_rendering",
#             stage_started,
#             endpoint="/generate-invoice",
#             request_id=getattr(g, "request_id", ""),
#             trace_id=getattr(g, "trace_id", ""),
#             invoice_generated=bool(invoice_path),
#         )

#         return jsonify(
#             ok(
#                 result.to_dict(),
#                 invoice_path=invoice_path,
#                 run_id=run_id,
#                 quality_score=score_extraction(result),
#             )
#         ), 201

#     except Exception as exc:
#         try:
#             stage_failure(
#                 logger,
#                 "invoice_rendering",
#                 stage_started,
#                 exc,
#                 endpoint="/generate-invoice",
#                 request_id=getattr(g, "request_id", ""),
#                 trace_id=getattr(g, "trace_id", ""),
#                 failure_category=classify_failure(exc),
#             )
#         except Exception:
#             logger.exception("stage_failure logging failed for /generate-invoice")

#         logger.exception(
#             "generate-invoice failed"
#         )

#         return jsonify(
#             err(str(exc))
#         ), 500

#     finally:

#         if temp_path and os.path.exists(temp_path):

#             os.remove(temp_path)


# # ---------------------------------------------------------------------------
# # upload invoice generation
# # ---------------------------------------------------------------------------

# @app.post("/generate-invoice/upload")
# def generate_invoice_upload():

#     temp_files = []

#     try:
#         run_id = request.form.get("run_id") or str(uuid.uuid4())

#         if "file" not in request.files:

#             return jsonify(
#                 err("file field is required")
#             ), 400

#         pdf_path = _save_upload(
#             request.files["file"]
#         )

#         temp_files.append(pdf_path)

#         company_raw = _json.loads(
#             request.form.get("company_data") or "{}"
#         )

#         profile = CompanyProfile.from_dict(
#             company_raw
#         )

#         def _save_opt(field, prefix):

#             if field in request.files:

#                 p = str(
#                     _UPLOAD_DIR
#                     / f"{prefix}_{request.files[field].filename}"
#                 )

#                 request.files[field].save(p)

#                 temp_files.append(p)

#                 return p

#             return None

#         # ---------------------------------------------------------------
#         # extraction
#         # ---------------------------------------------------------------

#         result = _run_service_extraction(
#             pdf_path=pdf_path,
#             company_profile=profile,
#             run_id=run_id,
#         )

#         if not validate_extraction(result):

#             return jsonify(
#                 err(
#                     "Extraction produced no valid rows",
#                     result.warnings,
#                 )
#             ), 422

#         # ---------------------------------------------------------------
#         # generate invoice
#         # ---------------------------------------------------------------

#         try:
#             invoice_path = _render_pdf_isolated(
#                 output_dir=str(_OUTPUT_DIR),
#                 result=result,
#                 profile=profile,
#                 template_path=_save_opt("template", "tpl"),
#                 signature_path=_save_opt("signature", "sig"),
#                 stamp_path=_save_opt("stamp", "stmp"),
#                 include_signature=request.form.get(
#                     "include_signature",
#                     "true",
#                 ).lower() == "true",
#                 include_stamp=request.form.get(
#                     "include_stamp",
#                     "true",
#                 ).lower() == "true",
#                 run_id=run_id,
#                 source_pdf_path=pdf_path,
#             )
#         except RuntimeError as exc:
#             if str(exc) == "PDF_RENDER_TIMEOUT":
#                 result.warnings.append("review_recommended:render_timeout")
#                 log_event(
#                     logger,
#                     "timeout_degradation_activated",
#                     stage="invoice_rendering",
#                     run_id=run_id,
#                     endpoint="/generate-invoice/upload",
#                 )
#                 return jsonify(
#                     ok(
#                         result.to_dict(),
#                         invoice_path=None,
#                         run_id=run_id,
#                         quality_score=score_extraction(result),
#                         review_recommended=True,
#                     )
#                 ), 202
#             raise

#         return jsonify(
#             ok(
#                 result.to_dict(),
#                 invoice_path=invoice_path,
#                 run_id=run_id,
#                 quality_score=score_extraction(result),
#             )
#         ), 201

#     except Exception as exc:

#         logger.exception(
#             "generate-invoice/upload failed"
#         )

#         return jsonify(
#             err(str(exc))
#         ), 500

#     finally:

#         for p in temp_files:

#             try:

#                 if os.path.exists(p):
#                     os.remove(p)

#             except Exception:
#                 pass


# # ---------------------------------------------------------------------------
# # download invoice
# # ---------------------------------------------------------------------------

# @app.get("/download-invoice/<filename>")
# def download_invoice(filename: str):

#     path = _OUTPUT_DIR / filename

#     if not path.exists():

#         return jsonify(
#             err("File not found")
#         ), 404

#     return send_file(
#         str(path),
#         mimetype="application/pdf",
#         as_attachment=True,
#         download_name=filename,
#     )


# # ---------------------------------------------------------------------------
# # run
# # ---------------------------------------------------------------------------

# if __name__ == "__main__":

#     port = int(
#         os.getenv("PORT", 8001)
#     )

#     app.run(
#         debug=False,
#         use_reloader=False,
#         port=port,
#         host="0.0.0.0",
#     )
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

import json as _json
import logging
import os
import tempfile
import uuid
from pathlib import Path
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

# Legacy pipeline (kept for backward compat)
from pipeline import run_extraction
from extractor import apply_semantic_overlay_to_result
from generator import generate_invoice_pdf
from schema import CompanyProfile, validate_extraction
from validation import score_extraction
from config_runtime import CONFIG
from pipeline.structured_logging import (
    classify_failure, log_event, set_trace_context,
    stage_complete, stage_failure, stage_start,
)

app = Flask(__name__)
CORS(app)
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

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
    name = file_obj.filename or "upload.pdf"
    path = _UPLOAD_DIR / name
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
    path = _OUTPUT_DIR / filename
    if not path.exists():
        return jsonify(err("File not found")), 404
    return send_file(str(path), mimetype="application/pdf", as_attachment=True, download_name=filename)

@app.route("/debug", methods=["GET"])
def debug():
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
    port = int(os.getenv("PORT", 8001))
    app.run(debug=False, use_reloader=False, port=port, host="0.0.0.0")