"""
generator/pdf_writer.py

Single public entry point: generate_invoice_pdf(...)

Orchestrates:
  1. Resolve template / signature / stamp assets.
  2. Apply VAT computation to each row if not already done.
  3. Route to the correct layout renderer based on ExtractionResult.layout.
  4. Write the final PDF and return its path.
"""

from __future__ import annotations

import logging
import os
from datetime import datetime
from typing import Optional

import cv2
from reportlab.lib.pagesizes import A4
from reportlab.pdfgen import canvas

from schema import CompanyProfile, ExtractionResult
from generator.assets import materialize_asset, template_to_image
from generator.templates import (
    BackgroundRenderer,
    SafeZoneDetector,
    TemplateAnalyzer,
    TemplateClass,
    TemplateLoader,
    TemplateSanitizer,
)
from generator.templates.compact_single_page_engine import CompactSinglePageInvoiceEngine
from pipeline.structured_logging import log_event


logger = logging.getLogger(__name__)


def generate_invoice_pdf(
    output_dir:    str,
    result:        ExtractionResult,
    profile:       CompanyProfile,
    template_path: Optional[str] = None,
    signature_path: Optional[str] = None,
    stamp_path:    Optional[str] = None,
    include_signature: bool = True,
    include_stamp: bool = True,
    run_id: Optional[str] = None,
    source_pdf_path: Optional[str] = None,
) -> str:
    """
    Generate a tax invoice PDF from an extraction result.

    Args:
        output_dir:     Directory where the PDF will be written.
        result:         ExtractionResult from run_extraction().
        profile:        CompanyProfile (the company issuing the invoice).
        template_path:  Optional PDF/PNG letterhead template (overrides profile).
        signature_path: Optional signature image (overrides profile).
        stamp_path:     Optional stamp image (overrides profile).

    Returns:
        Absolute path to the generated PDF.
    """
    os.makedirs(output_dir, exist_ok=True)
    timestamp   = int(datetime.now().timestamp())
    output_path = os.path.join(output_dir, f"tax-invoice-{timestamp}.pdf")

    # ---- Resolve asset paths ----
    tpl_src  = template_path  or profile.template_path
    sig_src  = (signature_path or profile.signature_path) if include_signature else None
    stmp_src = (stamp_path or profile.stamp_path) if include_stamp else None

    resolved_tpl  = materialize_asset(tpl_src,  output_dir, "tpl")
    resolved_sig  = materialize_asset(sig_src,  output_dir, "sig")
    resolved_stmp = materialize_asset(stmp_src, output_dir, "stmp")

    bg_path   = template_to_image(resolved_tpl, output_dir)
    sig_path  = resolved_sig  if resolved_sig  and os.path.exists(resolved_sig)  else None
    stmp_path = resolved_stmp if resolved_stmp and os.path.exists(resolved_stmp) else None

    # Always load owner template as background source-of-truth when available.
    loader = TemplateLoader(work_dir=output_dir, dpi=200)
    template_asset = loader.load(local_path=resolved_tpl)
    if not template_asset:
        template_asset = loader.load(local_path=bg_path)

    sanitizer = TemplateSanitizer(work_dir=output_dir)
    sanitization = sanitizer.classify_and_sanitize(template_asset)
    template_asset = sanitization.template_asset
    if template_asset and sanitization.classification == TemplateClass.DIRTY_TEMPLATE:
        logger.warning(
            "dirty_template_detected score=%.2f reasons=%s",
            sanitization.dirty_score,
            ",".join(sanitization.reasons),
        )

    # ---- Ensure VAT is computed ----
    if result.rows and result.rows[0].vat_amount == 0.0:
        for row in result.rows:
            row.compute_vat(profile.vat_rate)

    # ---- Build safe zone from template analysis ----
    page_w, page_h = A4
    if template_asset and template_asset.page_images:
        first_page = template_asset.page_images[0]
        image = cv2.imread(first_page)
        if image is not None:
            analysis = TemplateAnalyzer().analyze(image)
            safe_zone_px = SafeZoneDetector().detect(analysis, image_shape=image.shape[:2]).to_dict()

            sx = page_w / float(template_asset.width_px)
            sy = page_h / float(template_asset.height_px)

            safe_zone = {
                "content_left": int(safe_zone_px["content_left"] * sx),
                "content_right": int(safe_zone_px["content_right"] * sx),
                "content_top": int(page_h - (safe_zone_px["content_top"] * sy)),
                "content_bottom": int(page_h - (safe_zone_px["content_bottom"] * sy)),
            }
        else:
            safe_zone = {
                "content_left": 50,
                "content_right": int(page_w - 40),
                "content_top": int(page_h - 130),
                "content_bottom": 120,
            }
    else:
        safe_zone = {
            "content_left": 50,
            "content_right": int(page_w - 40),
            "content_top": int(page_h - 130),
            "content_bottom": 120,
        }

    # Backend DB values should override OCR metadata for client block.
    profile_data = profile.__dict__ if hasattr(profile, "__dict__") else {}
    client_details = {
        "name": profile_data.get("clientName") or profile_data.get("client_name") or result.metadata.client_name or "Client",
        "trn": profile_data.get("clientTrn") or profile_data.get("client_trn") or result.metadata.client_trn or "",
        "address": profile_data.get("clientAddress") or profile_data.get("client_address") or result.metadata.client_address or "",
    }

    # ---- Draw ----
    c = canvas.Canvas(output_path, pagesize=A4)
    background_renderer = BackgroundRenderer(page_size=A4)
    engine = CompactSinglePageInvoiceEngine()

    # Financial integrity guard: once summary deduction is detected upstream, it must not disappear at render stage.
    if result.financials.summary_detected and result.financials.deduction_source == "financial_summary" and float(result.financials.total_deduction or 0.0) <= 0.0:
        logger.error(
            "financial_integrity_violation run_id=%s pdf_path=%s source=%s summary_detected=%s deduction=%s",
            run_id,
            source_pdf_path,
            result.financials.deduction_source,
            result.financials.summary_detected,
            result.financials.total_deduction,
        )
        raise ValueError("financial integrity violation: summary deduction lost before renderer")

    log_event(
        logger,
        "financial_state",
        stage="before_renderer",
        run_id=run_id or "",
        pdf_path=source_pdf_path or "",
        subtotal=float(result.financials.subtotal or 0.0),
        deduction=float(result.financials.total_deduction or 0.0),
        deduction_vat=float(result.financials.deduction_vat or 0.0),
        adjusted_subtotal=float(result.financials.adjusted_subtotal or 0.0),
        vat=float(result.financials.total_vat or 0.0),
        net_total=float(result.financials.net_payable or 0.0),
        deduction_source=result.financials.deduction_source,
        summary_detected=result.financials.summary_detected,
    )

    def _on_page_start(page_idx: int) -> None:
        # Full-page template FIRST, then overlay invoice content once.
        background_renderer.draw_background(c, template_asset, page_idx)

    _on_page_start(0)

    rendered_once = False
    if rendered_once:
        raise RuntimeError("Single-pass render guard violation")
    engine.render(
        c=c,
        result=result,
        profile=profile,
        client_details=client_details,
        signature_path=sig_path,
        stamp_path=stmp_path,
        safe_zone=safe_zone,
    )
    rendered_once = True

    c.save()

    log_event(
        logger,
        "financial_state",
        stage="after_renderer",
        run_id=run_id or "",
        pdf_path=source_pdf_path or "",
        subtotal=float(result.financials.subtotal or 0.0),
        deduction=float(result.financials.total_deduction or 0.0),
        deduction_vat=float(result.financials.deduction_vat or 0.0),
        adjusted_subtotal=float(result.financials.adjusted_subtotal or 0.0),
        vat=float(result.financials.total_vat or 0.0),
        net_total=float(result.financials.net_payable or 0.0),
        deduction_source=result.financials.deduction_source,
        summary_detected=result.financials.summary_detected,
    )

    return output_path
