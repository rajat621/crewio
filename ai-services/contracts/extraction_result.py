from pydantic import BaseModel
from typing import List


class Trade(BaseModel):
    trade: str
    workers: int
    days: float
    hours: float
    rate: float
    amount: float


class Summary(BaseModel):
    subtotal: float
    vat: float
    total: float


class ExtractionResult(BaseModel):
    company_name: str
    project_name: str
    invoice_period: str

    trades: List[Trade]

    summary: Summary

    confidence: float