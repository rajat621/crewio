from typing import Any, Dict

from pipeline import run_hybrid_extraction


def extract_invoice_data_from_pdf(pdf_path: str) -> Dict[str, Any]:
    """Backward-compatible wrapper returning normalized invoice extraction."""
    return run_hybrid_extraction(pdf_path, document_type="invoice_summary")


def extract_document_data(pdf_path: str, document_type: str = "auto") -> Dict[str, Any]:
    """Generic extraction entry point for invoice/attendance/auto flows."""
    return run_hybrid_extraction(pdf_path, document_type=document_type)
