// src/hooks/useDocumentUpload.js
//
// Shared upload logic for employee documents (passport/Emirates ID/labour
// card/medical certificate/residence ID/contract copies), used by both
// AddEmployee.jsx (Step2) and PassportDetailsTab.jsx (Employee Profile
// editing) so the validation/progress/retry/remove behaviour can't drift
// between the two places a document gets uploaded.
//
// This hook owns upload STATE only (status/error/progress per field) - each
// caller keeps its own existing visual design and just reads this state.
import { useCallback, useRef, useState } from 'react';
import { employeesApi } from '../api/employees';

export const DOCUMENT_MAX_BYTES = 5 * 1024 * 1024;
export const DOCUMENT_ALLOWED_MIME_TYPES = ['application/pdf', 'image/jpeg', 'image/png'];
export const DOCUMENT_ALLOWED_EXTENSIONS = ['.pdf', '.jpg', '.jpeg', '.png'];
export const DOCUMENT_ACCEPT_ATTR = '.pdf,.jpg,.jpeg,.png';

export const validateDocumentFile = (file) => {
  if (!file) return 'No file selected.';
  const ext = `.${(file.name.split('.').pop() || '').toLowerCase()}`;
  if (!DOCUMENT_ALLOWED_MIME_TYPES.includes(file.type) || !DOCUMENT_ALLOWED_EXTENSIONS.includes(ext)) {
    return 'Only PDF, JPG, JPEG and PNG files are allowed.';
  }
  if (file.size > DOCUMENT_MAX_BYTES) {
    return 'File exceeds the 5MB size limit.';
  }
  return null;
};

export function useDocumentUpload() {
  const [status, setStatus] = useState({}); // { [field]: 'idle' | 'uploading' | 'success' | 'error' }
  const [errors, setErrors] = useState({});
  const [progress, setProgress] = useState({});
  const statusRef = useRef({});
  const lastFileRef = useRef({});

  const setFieldStatus = (field, value) => {
    statusRef.current = { ...statusRef.current, [field]: value };
    setStatus((prev) => ({ ...prev, [field]: value }));
  };
  const setFieldError = (field, message) => setErrors((prev) => ({ ...prev, [field]: message }));
  const setFieldProgress = (field, pct) => setProgress((prev) => ({ ...prev, [field]: pct }));

  /**
   * Validates and uploads [file] for [field], calling onSuccess(fileUrl,
   * fileName) once the server confirms it. Never stores anything but the
   * returned reference - onSuccess is expected to write that into whatever
   * form state the caller owns.
   */
  const upload = useCallback(async (field, file, onSuccess) => {
    if (!file) return;

    // Prevent duplicate uploads while one is already in progress for this
    // field - re-selecting/dropping a new file mid-upload is a no-op.
    if (statusRef.current[field] === 'uploading') return;

    const validationError = validateDocumentFile(file);
    if (validationError) {
      setFieldStatus(field, 'error');
      setFieldError(field, validationError);
      return;
    }

    lastFileRef.current[field] = file;
    setFieldStatus(field, 'uploading');
    setFieldError(field, '');
    setFieldProgress(field, 0);

    try {
      const response = await employeesApi.uploadDocument(file, {
        onProgress: (pct) => setFieldProgress(field, pct),
      });
      const fileUrl = response?.data?.fileUrl;
      if (!fileUrl) throw new Error('Upload succeeded but no file reference was returned.');
      setFieldStatus(field, 'success');
      onSuccess(fileUrl, file.name);
    } catch (err) {
      setFieldStatus(field, 'error');
      setFieldError(field, err?.response?.data?.message || 'Upload failed. Please try again.');
    }
  }, []);

  const retry = useCallback((field, onSuccess) => {
    const file = lastFileRef.current[field];
    if (file) upload(field, file, onSuccess);
  }, [upload]);

  const remove = useCallback((field, onSuccess) => {
    delete lastFileRef.current[field];
    setFieldStatus(field, 'idle');
    setFieldError(field, '');
    setFieldProgress(field, 0);
    onSuccess(null, null);
  }, []);

  const canRetry = useCallback((field) => Boolean(lastFileRef.current[field]), []);

  return {
    status,
    errors,
    progress,
    upload,
    retry,
    remove,
    canRetry,
    isUploading: (field) => status[field] === 'uploading',
  };
}
