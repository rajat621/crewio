import logging
import os
import tempfile
from pathlib import Path

from dotenv import load_dotenv
from flask import Flask, jsonify, request
from flask_cors import CORS

from contracts import error_response, extraction_response
from extractor import extract_document_data
from pdf_generator import generate_invoice_pdf
from schema import validate_attendance_rows, validate_extracted_data, validate_invoice_rows
from validation import score_extraction
from pipeline import get_ocr_capabilities

load_dotenv()

app = Flask(__name__)
CORS(app)

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

@app.route('/health', methods=['GET'])
def health():
    """Health check endpoint"""
    return jsonify({'status': 'AI Service is running'}), 200


@app.route('/capabilities', methods=['GET'])
def capabilities():
    """Report AI service capabilities (OCR, extraction, generation)."""
    return jsonify({
        'status': 'ok',
        'ocr': get_ocr_capabilities(),
        'extraction': {
            'invoice_summary': True,
            'attendance': True,
            'auto_detection': True,
        },
        'generation': {
            'pdf': True,
            'template_driven': True,
        },
    }), 200


def _save_temp_upload(file_obj) -> str:
    temp_dir = Path(tempfile.gettempdir()) / 'crew-control-ai'
    temp_dir.mkdir(parents=True, exist_ok=True)
    filename = file_obj.filename or 'upload.pdf'
    temp_path = temp_dir / filename
    file_obj.save(str(temp_path))
    return str(temp_path)


def _extract_with_mode(pdf_path: str, mode: str) -> dict:
    extracted = extract_document_data(pdf_path, document_type=mode)
    extracted = score_extraction(extracted)
    return extracted


@app.route('/extract', methods=['POST'])
def extract():
    """Reusable extraction endpoint supporting file upload or direct pdf_path."""
    temp_path = None
    try:
        mode = request.form.get('document_type') if request.form else None
        body = request.get_json(silent=True) or {}
        mode = mode or body.get('document_type') or 'auto'
        pdf_path = body.get('pdf_path')

        if 'file' in request.files:
            temp_path = _save_temp_upload(request.files['file'])
            pdf_path = temp_path

        if not pdf_path:
            return jsonify(error_response('pdf_path or file is required')), 400
        if not os.path.exists(pdf_path):
            return jsonify(error_response('pdf_path does not exist', pdf_path)), 400

        extracted = _extract_with_mode(pdf_path, mode)
        if not validate_extracted_data(extracted):
            return jsonify(error_response('Unable to validate extracted tables', extracted.get('validation'))), 422

        return jsonify(extraction_response(extracted)), 200
    except Exception as e:
        logger.error('Error in extract: %s', str(e))
        return jsonify(error_response(str(e))), 500
    finally:
        if temp_path and os.path.exists(temp_path):
            os.remove(temp_path)


@app.route('/extract/invoice-summary', methods=['POST'])
def extract_invoice_summary():
    """Extraction endpoint for invoice summary rows."""
    try:
        data = request.get_json() or {}
        pdf_path = data.get('pdf_path')
        if not pdf_path:
            return jsonify(error_response('pdf_path is required')), 400
        if not os.path.exists(pdf_path):
            return jsonify(error_response('pdf_path does not exist', pdf_path)), 400

        extracted = _extract_with_mode(pdf_path, 'invoice_summary')
        rows = extracted.get('invoice_summary', {}).get('rows', [])
        if not validate_invoice_rows(rows):
            return jsonify(error_response('No valid invoice summary rows found', extracted.get('validation'))), 422

        return jsonify(extraction_response(extracted)), 200
    except Exception as e:
        logger.error('Error in extract_invoice_summary: %s', str(e))
        return jsonify(error_response(str(e))), 500


@app.route('/extract/attendance', methods=['POST'])
def extract_attendance():
    """Extraction endpoint for attendance/payroll rows."""
    try:
        data = request.get_json() or {}
        pdf_path = data.get('pdf_path')
        if not pdf_path:
            return jsonify(error_response('pdf_path is required')), 400
        if not os.path.exists(pdf_path):
            return jsonify(error_response('pdf_path does not exist', pdf_path)), 400

        extracted = _extract_with_mode(pdf_path, 'attendance')
        rows = extracted.get('attendance', {}).get('rows', [])
        if not validate_attendance_rows(rows):
            return jsonify(error_response('No valid attendance rows found', extracted.get('validation'))), 422

        return jsonify(extraction_response(extracted)), 200
    except Exception as e:
        logger.error('Error in extract_attendance: %s', str(e))
        return jsonify(error_response(str(e))), 500


@app.route('/generate-invoice', methods=['POST'])
def generate_invoice():
    """Extract, validate, and generate a template-driven tax invoice PDF."""
    try:
        data = request.get_json() or {}
        pdf_path = data.get('pdf_path')
        template_path = data.get('template_path')
        signature_path = data.get('signature_path')
        stamp_path = data.get('stamp_path')
        company_data = data.get('company_data', {})

        if not pdf_path:
            return jsonify(error_response('pdf_path is required')), 400
        if not os.path.exists(pdf_path):
            return jsonify(error_response('pdf_path does not exist', pdf_path)), 400

        extracted = _extract_with_mode(pdf_path, 'auto')
        rows = extracted.get('invoice_summary', {}).get('rows', [])
        if not validate_invoice_rows(rows):
            return jsonify(error_response('Invoice rows not found or invalid', extracted.get('validation'))), 422

        output_dir = os.path.join(tempfile.gettempdir(), 'crew-control-ai-output')
        invoice_path = generate_invoice_pdf(
            output_dir=output_dir,
            extracted=extracted,
            company_data=company_data,
            template_path=template_path,
            signature_path=signature_path,
            stamp_path=stamp_path,
        )

        return jsonify(
            {
                'success': True,
                'data': extracted,
                'invoice_path': invoice_path,
                'validation': extracted.get('validation', {}),
            }
        ), 201
    except Exception as e:
        logger.error('Error in generate_invoice: %s', str(e))
        return jsonify(error_response(str(e))), 500

if __name__ == '__main__':
    port = int(os.getenv('PORT', 8001))
    app.run(debug=True, port=port, host='0.0.0.0')
