# ai-service/generator/__init__.py
"""generator – PDF invoice generation sub-package."""
from .pdf_writer import generate_invoice_pdf

__all__ = ["generate_invoice_pdf"]
