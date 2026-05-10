import { useState, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { companiesApi } from "../api/companies";
import "../styles/auth.css";

export default function OnboardingCompanyLogo() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const fileInputRef = useRef(null);
  
  const [logo, setLogo] = useState(null);
  const [logoPreview, setLogoPreview] = useState(null);
  const [dragActive, setDragActive] = useState(false);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  const readAsDataUrl = (file) => new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => resolve(reader.result);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });

  const handleLogoChange = (file) => {
    if (file && file.type.startsWith("image/") && file.size <= 2 * 1024 * 1024) {
      setLogo(file);
      setError("");
      const reader = new FileReader();
      reader.onloadend = () => {
        setLogoPreview(reader.result);
      };
      reader.readAsDataURL(file);
    } else if (file && file.size > 2 * 1024 * 1024) {
      alert("File size must be less than 2MB");
    } else if (file) {
      alert("Only PNG and JPG formats are accepted");
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
      handleLogoChange(e.dataTransfer.files[0]);
    }
  };

  const handleBrowseClick = () => {
    fileInputRef.current?.click();
  };

  const handleFileInputChange = (e) => {
    if (e.target.files && e.target.files[0]) {
      handleLogoChange(e.target.files[0]);
    }
  };

  const handleSkip = () => {
    navigate("/onboarding/company-template");
  };

  const handleBack = () => {
    navigate("/onboarding/company-profile");
  };

  const handleNext = async () => {
    if (!logo) {
      setError("Please upload a logo or use Skip to continue.");
      return;
    }

    if (!user?.companyId) {
      setError("No company is associated with this account yet.");
      return;
    }

    try {
      setSaving(true);
      setError("");
      const logoDataUrl = await readAsDataUrl(logo);
      const response = await companiesApi.updateCompany(user.companyId, { logo: logoDataUrl });
      if (!response.data?.data) {
        throw new Error("Logo save failed");
      }
      navigate("/onboarding/company-template");
    } catch (err) {
      setError(err.response?.data?.message || "Failed to save logo. Please try again.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="auth-wrapper onboarding-wrapper">
      <div className="brand"><img src={import.meta.env.BASE_URL + 'crewio_logo.png'} alt="CrewControl logo" /></div>

      <div className="auth-card onboarding-card">
        <h2 className="onboarding-title">Set Up Your Company Profile</h2>
        <p className="onboarding-subtitle">
          This information will appear on your tax invoices and official documents.
          <br />
          Please ensure all details match your registered business records.
        </p>

        {error && <p className="field-error">{error}</p>}

        <h3 className="onboarding-section-title">
          Company Logo <span className="onboarding-optional">(Optional but Recommended)</span>
        </h3>

        <label className="onboarding-label">Upload Logo</label>

        <div
          className={`onboarding-upload-area ${dragActive ? "drag-active" : ""} ${logoPreview ? "has-preview" : ""}`}
          onDragEnter={handleDrag}
          onDragLeave={handleDrag}
          onDragOver={handleDrag}
          onDrop={handleDrop}
        >
            {logoPreview ? (
              <div className="logo-preview-container">
                <img src={logoPreview} alt="Logo Preview" className="logo-preview-image" />
                <button
                  type="button"
                  className="remove-logo-btn"
                  onClick={() => {
                    setLogo(null);
                    setLogoPreview(null);
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

                <p className="upload-text">Drag and drop your logo file here</p>
                <p className="upload-hint">Accepted formats: PNG, JPG (Max 2MB)</p>

                <div className="upload-divider">- OR -</div>

                <button type="button" className="onboarding-browse-btn" onClick={handleBrowseClick}>
                  Browse
                </button>

                <input
                  ref={fileInputRef}
                  type="file"
                  hidden
                  accept=".png,.jpg,.jpeg"
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
