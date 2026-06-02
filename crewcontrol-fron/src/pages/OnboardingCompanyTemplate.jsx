import { useState, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { companiesApi } from "../api/companies";
import logo from "../assets/crewio_logo.png";
import "../styles/auth.css";

export default function OnboardingCompanyTemplate() {
  const navigate = useNavigate();
  const fileInputRef = useRef(null);
  
  const [template, setTemplate] = useState(null);
  const [templatePreview, setTemplatePreview] = useState(null);
  const [dragActive, setDragActive] = useState(false);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  const readAsDataUrl = (file) => new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => resolve(reader.result);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });

  const handleTemplateChange = (file) => {
    if (file && file.type === "application/pdf" && file.size <= 5 * 1024 * 1024) {
      setTemplate(file);
      setError("");
      setTemplatePreview(file.name);
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
      handleTemplateChange(e.dataTransfer.files[0]);
    }
  };

  const handleBrowseClick = () => {
    fileInputRef.current?.click();
  };

  const handleFileInputChange = (e) => {
    if (e.target.files && e.target.files[0]) {
      handleTemplateChange(e.target.files[0]);
    }
  };

  const handleSkip = () => {
    navigate("/onboarding/authorized-signature");
  };

  const handleBack = () => {
    navigate("/onboarding/company-logo");
  };

  const handleNext = async () => {
    if (!template) {
      setError("Please upload a template or use Skip to continue.");
      return;
    }

    try {
      setSaving(true);
      setError("");
      const templateDataUrl = await readAsDataUrl(template);
      const response = await companiesApi.updateOwnerCompany({ invoiceTemplate: templateDataUrl });
      if (!response.data?.data) {
        throw new Error("Template save failed");
      }
      navigate("/onboarding/authorized-signature");
    } catch (err) {
      setError(err.response?.data?.message || "Failed to save template. Please try again.");
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
          Upload Your Company Template
        </h3>

        <label className="onboarding-label">Upload Template</label>

        <div
          className={`onboarding-upload-area ${dragActive ? "drag-active" : ""} ${templatePreview ? "has-preview" : ""}`}
          onDragEnter={handleDrag}
          onDragLeave={handleDrag}
          onDragOver={handleDrag}
          onDrop={handleDrop}
        >
          {templatePreview ? (
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
                <text x="50%" y="50%" textAnchor="middle" dy=".3em" fontSize="10" fontWeight="bold" fill="currentColor">PDF</text>
              </svg>
              <p className="template-name">{templatePreview}</p>
              <button
                type="button"
                className="remove-template-btn"
                onClick={() => {
                  setTemplate(null);
                  setTemplatePreview(null);
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

              <p className="upload-text">Drag & drop the Template here</p>
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
            <button type="button" className="btn-primary onboarding-next-btn" onClick={handleNext} disabled={saving}>
              {saving ? "Saving..." : "Next"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
