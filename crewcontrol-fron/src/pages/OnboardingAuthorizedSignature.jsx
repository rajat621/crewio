import { useState, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { companiesApi } from "../api/companies";
import logo from "../assets/crewio_logo.png";
import "../styles/auth.css";

export default function OnboardingAuthorizedSignature() {
  const navigate = useNavigate();
  const fileInputRef = useRef(null);
  
  const [signature, setSignature] = useState(null);
  const [signaturePreview, setSignaturePreview] = useState(null);
  const [dragActive, setDragActive] = useState(false);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  const readAsDataUrl = (file) => new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => resolve(reader.result);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });

  const handleSignatureChange = (file) => {
    if (file && file.type === "application/pdf" && file.size <= 5 * 1024 * 1024) {
      setSignature(file);
      setError("");
      setSignaturePreview(file.name);
    } else if (file && file.size > 5 * 1024 * 1024) {
      alert("File size must be less than 5MB");
    } else if (file) {
      alert("Only PDF format is accepted");
    }
  };

  const handleDrag = (e) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === "dragenter" || e.type === "dragover") {
      setDragActive(true);
    } else if (e.type === "dragleave") {
      setDragActive(false);
    }
  };

  const handleDrop = (e) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);

    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      handleSignatureChange(e.dataTransfer.files[0]);
    }
  };

  const handleBrowseClick = () => {
    fileInputRef.current?.click();
  };

  const handleFileInputChange = (e) => {
    if (e.target.files && e.target.files[0]) {
      handleSignatureChange(e.target.files[0]);
    }
  };

  const handleSkip = () => {
    navigate("/");
  };

  const handleBack = () => {
    navigate("/onboarding/company-template");
  };

  const handleSave = async () => {
    if (!signature) {
      setError("Please upload a signature or use Skip to finish without saving.");
      return;
    }

    try {
      setSaving(true);
      setError("");
      const signatureDataUrl = await readAsDataUrl(signature);
      const response = await companiesApi.updateOwnerCompany({ signature: signatureDataUrl });
      if (!response.data?.data) {
        throw new Error("Signature save failed");
      }
      navigate("/onboarding/success");
    } catch (err) {
      setError(err.response?.data?.message || "Failed to save signature. Please try again.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="auth-wrapper onboarding-wrapper">
      <div className="brand"><img src={logo} alt="CrewControl logo" /></div>

      <div className="auth-card onboarding-card">
        <h2 className="onboarding-title">Set Up Your Company Profile</h2>
        <p className="onboarding-subtitle">
          This information will appear on your tax invoices and official documents.
          <br />
          Please ensure all details match your registered business records.
        </p>

        {error && <p className="field-error">{error}</p>}

        <h3 className="onboarding-section-title">
          Add Authorized Signature
        </h3>

        <label className="onboarding-label">Upload Signature</label>

        <div
          className={`onboarding-upload-area ${dragActive ? "drag-active" : ""} ${signaturePreview ? "has-preview" : ""}`}
          onDragEnter={handleDrag}
          onDragLeave={handleDrag}
          onDragOver={handleDrag}
          onDrop={handleDrop}
        >
          {signaturePreview ? (
            <div className="template-preview-container">
              <svg
                className="pdf-icon"
                width="48"
                height="48"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.5"
              >
                <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path>
                <polyline points="14 2 14 8 20 8"></polyline>
              </svg>
              <p className="template-name">{signaturePreview}</p>
              <button
                type="button"
                className="remove-template-btn"
                onClick={() => {
                  setSignature(null);
                  setSignaturePreview(null);
                }}
              >
                Remove
              </button>
            </div>
          ) : (
            <>
              <svg
                className="upload-icon"
                width="48"
                height="48"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.5"
              >
                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path>
                <polyline points="17 8 12 3 7 8"></polyline>
                <line x1="12" y1="3" x2="12" y2="15"></line>
              </svg>

              <p className="upload-text">Drag & drop the timesheet here</p>
              <p className="upload-hint">Accepted formats: PDF (Max 5MB)</p>

              <div className="upload-divider">- OR -</div>

              <button type="button" className="onboarding-browse-btn" onClick={handleBrowseClick}>
                Browse
              </button>

              <input
                ref={fileInputRef}
                type="file"
                hidden
                accept=".pdf"
                onChange={handleFileInputChange}
              />
            </>
          )}
        </div>

        <div className="onboarding-actions">
          <button type="button" className="onboarding-link-button" onClick={handleSkip}>
            Skip
          </button>
          <div className="onboarding-right-actions">
            <button type="button" className="onboarding-link-button" onClick={handleBack}>
              Back
            </button>
            <button type="button" className="btn-primary onboarding-next-btn" onClick={handleSave} disabled={saving}>
              {saving ? "Saving..." : "Save"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
