import { useState, useRef, useMemo, useCallback, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { authApi } from "../api/auth";
import { companiesApi } from "../api/companies";
import { useAuth } from "../context/AuthContext";
import { COUNTRIES_LIST } from "../utils/countriesData";
import { clampMobileByCountry } from "../utils/phoneValidation";
import ReactCountryFlag from "react-country-flag";
import "../styles/auth.css";
import logo from "../assets/crewio_logo.png";

const STEPS = {
  ACCOUNT_DETAILS: 0,
  ACCOUNT_INFO: 1,
  BUSINESS: 2,
  ADDRESS: 3,
  CONTACT: 4,
  LOGO: 5,
  TEMPLATE: 6,
  SIGNATURE: 7,
  SUCCESS: 8
};

const COUNTRY_CODES = COUNTRIES_LIST.map((country) => ({
  iso: country.isoCode,
  code: country.phoneCode,
  country: country.name,
  flag: country.flag,
}));

const normalizePhoneCode = (value) => {
  if (!value) return "";
  const digits = value.replace(/\D/g, "");
  return digits ? `+${digits}` : "";
};

const validateEmail = (email) => {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(email);
};

const validatePassword = (password) => {
  return password.length >= 8;
};

export default function ComprehensiveOnboarding() {
  const navigate = useNavigate();
  const { login } = useAuth();
  const fileInputRef = useRef(null);
  
  const [step, setStep] = useState(STEPS.ACCOUNT_DETAILS);
  const [errors, setErrors] = useState({});
  const [dragActive, setDragActive] = useState(false);
  const countryDropdownRef = useRef(null);
  const [showNationDropdown, setShowNationDropdown] = useState(false);
  const [nationSearch, setNationSearch] = useState("");
  const nationDropdownRef = useRef(null);
  const [otpValues, setOtpValues] = useState(Array(6).fill(""));
  const [otpTimeLeft, setOtpTimeLeft] = useState(240);
  const [signupLoading, setSignupLoading] = useState(false);
  const [otpVerifyLoading, setOtpVerifyLoading] = useState(false);
  const [otpResendLoading, setOtpResendLoading] = useState(false);
  const [onboardingSaving, setOnboardingSaving] = useState(false);
  const [signupError, setSignupError] = useState("");
  const [otpError, setOtpError] = useState("");
  const otpInputsRef = useRef([]);

  useEffect(() => {
    if (step !== STEPS.ACCOUNT_INFO) return;

    setOtpTimeLeft(240);
    const timer = setInterval(() => {
      setOtpTimeLeft((prev) => (prev > 0 ? prev - 1 : 0));
    }, 1000);

    return () => clearInterval(timer);
  }, [step]);

  useEffect(() => {
    const handleClickOutside = (e) => {
      if (nationDropdownRef.current && !nationDropdownRef.current.contains(e.target)) {
        setShowNationDropdown(false);
        setNationSearch("");
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);
  
  const [formData, setFormData] = useState({
    // Account Details
    firstName: "",
    lastName: "",
    email: "",
    password: "",
    confirmPassword: "",
    // Business Profile
    companyName: "",
    trn: "",
    website: "",
    address: "",
    city: "",
    nationality: "",
    // Contact
    officialEmail: "",
    countryIso: "AE",
    countryCode: "+971",
    mobile: "",
    // Files
    stamp: null,
    stampPreview: null,
    template: null,
    templatePreview: null,
    signature: null,
    signaturePreview: null
  });

  // Memoized validation functions
  const validateStep = useCallback(() => {
    const nextErrors = {};

    if (step === STEPS.ACCOUNT_DETAILS) {
      if (!formData.firstName.trim()) nextErrors.firstName = "First name is required";
      if (!formData.lastName.trim()) nextErrors.lastName = "Last name is required";
      if (!formData.email.trim()) nextErrors.email = "Email is required";
      else if (!validateEmail(formData.email)) nextErrors.email = "Invalid email format";
      if (!formData.password) nextErrors.password = "Password is required";
      else if (!validatePassword(formData.password)) nextErrors.password = "Password must be at least 8 characters";
      if (!formData.confirmPassword) nextErrors.confirmPassword = "Confirm password is required";
      else if (formData.password !== formData.confirmPassword) nextErrors.confirmPassword = "Passwords do not match";
    }

    if (step === STEPS.BUSINESS) {
      if (!formData.companyName.trim()) nextErrors.companyName = "Company name is required";
      if (!formData.trn.trim()) nextErrors.trn = "Tax Registration Number is required";
    }

    if (step === STEPS.ADDRESS) {
      if (!formData.address.trim()) nextErrors.address = "Address is required";
      if (!formData.city.trim()) nextErrors.city = "City is required";
    }

    if (step === STEPS.CONTACT) {
      if (!formData.officialEmail.trim()) nextErrors.officialEmail = "Official email is required";
      else if (!validateEmail(formData.officialEmail)) nextErrors.officialEmail = "Invalid email format";
      if (!formData.mobile.trim()) nextErrors.mobile = "Mobile number is required";
    }

    setErrors(nextErrors);
    return Object.keys(nextErrors).length === 0;
  }, [step, formData]);

  const handleChange = (e) => {
    const { name, value } = e.target;
    setFormData((prev) => {
      if (name === "mobile") {
        return {
          ...prev,
          mobile: clampMobileByCountry(value, {
            countryIso: prev.countryIso,
            countryCode: prev.countryCode,
          }),
        };
      }

      return { ...prev, [name]: value };
    });
    if (errors[name]) setErrors((prev) => ({ ...prev, [name]: "" }));
    if (signupError) setSignupError("");
    if (otpError) setOtpError("");
  };

  const handleCountrySelectChange = (e) => {
    const selectedIso = e.target.value;
    const selectedCountry = COUNTRY_CODES.find((item) => item.iso === selectedIso);
    if (!selectedCountry) return;
    setFormData((prev) => ({
      ...prev,
      countryIso: selectedCountry.iso,
      countryCode: selectedCountry.code,
      mobile: clampMobileByCountry(prev.mobile, {
        countryIso: selectedCountry.iso,
        countryCode: selectedCountry.code,
      }),
    }));
  };

  const handleCountryCodeChange = (e) => {
    const inputValue = e.target.value;
    if (!/^\+?[0-9\s-]*$/.test(inputValue)) return;
    const normalized = normalizePhoneCode(inputValue);
    const matchedCountry = COUNTRY_CODES.find(
      (item) => normalizePhoneCode(item.code) === normalized
    );
    setFormData((prev) => ({
      ...prev,
      countryIso: matchedCountry ? matchedCountry.iso : prev.countryIso,
      countryCode: normalized || inputValue,
      mobile: clampMobileByCountry(prev.mobile, {
        countryIso: matchedCountry ? matchedCountry.iso : prev.countryIso,
        countryCode: normalized || inputValue,
      }),
    }));
  };

  const selectedCountry = useMemo(() => {
    return COUNTRY_CODES.find((item) => item.iso === formData.countryIso) || COUNTRY_CODES[0];
  }, [formData.countryIso]);

  // File handlers
  const handleFileDrag = (e) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(e.type === "dragenter" || e.type === "dragover");
  };

  const handleFileDrop = (e, fileType) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);
    if (e.dataTransfer.files?.[0]) {
      handleFileChange(e.dataTransfer.files[0], fileType);
    }
  };

  const handleFileChange = (file, fileType) => {
    if (!file) return;
    const isPdf = file.type === "application/pdf";
    const isImage = file.type.startsWith("image/");

    if (fileType === "stamp" || fileType === "signature" || fileType === "template") {
      // Allow images or pdf for stamp/signature; template prefers pdf but accept image
      if (!(isPdf || isImage)) {
        alert("Only PDF or image formats accepted");
        return;
      }
      const maxSize = isPdf ? 10 * 1024 * 1024 : 5 * 1024 * 1024;
      if (file.size > maxSize) {
        alert(isPdf ? "PDF size must be less than 10MB" : "Image size must be less than 5MB");
        return;
      }

      const reader = new FileReader();
      reader.onload = (e) => {
        const dataUrl = e.target?.result;
        if (fileType === "stamp") {
          setFormData((prev) => ({ ...prev, stamp: dataUrl, stampPreview: isPdf ? file.name : dataUrl }));
        } else if (fileType === "template") {
          setFormData((prev) => ({ ...prev, template: dataUrl, templatePreview: file.name || "template.pdf" }));
        } else if (fileType === "signature") {
          setFormData((prev) => ({ ...prev, signature: dataUrl, signaturePreview: isPdf ? file.name : dataUrl }));
        }
      };
      reader.onerror = () => {
        alert("Failed to read file");
      };
      reader.readAsDataURL(file);
    }
  };

  const handleBrowseClick = () => fileInputRef.current?.click();

  const handleFileInputChange = (e, fileType) => {
    if (e.target.files?.[0]) handleFileChange(e.target.files[0], fileType);
  };

  const goToNextStep = () => {
    if (step < STEPS.SUCCESS) setStep((prev) => prev + 1);
  };

  const handleSkip = () => {
    setErrors({});
    goToNextStep();
  };

  const handleBack = () => {
    if (step > STEPS.ACCOUNT_DETAILS) {
      setErrors({});
      setStep((prev) => prev - 1);
    }
  };

  const handleNext = () => {
    if (!validateStep()) return;
    goToNextStep();
  };

  const handleSave = async () => {
    // Save uploaded assets (stamp/template/signature) to owner company record
    const updatePayload = {};
    if (formData.stamp) updatePayload.stamp = formData.stamp;
    if (formData.template) updatePayload.invoiceTemplate = formData.template;
    if (formData.signature) updatePayload.signature = formData.signature;

    // Include minimal business identifiers so backend can create owner company
    // (Mongoose requires `name` for company documents). Map onboarding fields
    // to the expected backend keys when present.
    if (formData.companyName && !updatePayload.name) updatePayload.name = formData.companyName.trim();
    if (formData.trn && !updatePayload.trn) updatePayload.trn = formData.trn.trim();

    if (Object.keys(updatePayload).length === 0) {
      goToNextStep();
      return;
    }

    try {
      setOnboardingSaving(true);
      const response = await companiesApi.updateOwnerCompany(updatePayload);
      if (response.data?.data) {
        // merge any returned data into formData (not strictly necessary)
        setFormData((prev) => ({ ...prev, ...{
          stamp: response.data.data.stamp || prev.stamp,
          stampPreview: response.data.data.stamp || prev.stampPreview,
          template: response.data.data.invoiceTemplate || prev.template,
          templatePreview: response.data.data.invoiceTemplate ? (typeof response.data.data.invoiceTemplate === 'string' && response.data.data.invoiceTemplate.startsWith('data:application/pdf') ? 'template.pdf' : response.data.data.invoiceTemplate) : prev.templatePreview,
          signature: response.data.data.signature || prev.signature,
          signaturePreview: response.data.data.signature || prev.signaturePreview,
        }}));
        goToNextStep();
      }
    } catch (err) {
      console.error('Onboarding save error:', err);
      setSignupError(err.response?.data?.message || 'Failed to save onboarding assets.');
    } finally {
      setOnboardingSaving(false);
    }
  };

  const handleContinue = () => {
    // TODO: Save all onboarding data to backend
    navigate("/");
  };

  const handleCreateAccount = async () => {
    if (!validateStep()) return;

    setSignupError("");
    try {
      setSignupLoading(true);
      await authApi.signup({
        firstName: formData.firstName.trim(),
        lastName: formData.lastName.trim(),
        email: formData.email.trim(),
        password: formData.password
      });
      setOtpValues(Array(6).fill(""));
      setOtpTimeLeft(240);
      goToNextStep();
    } catch (error) {
      setSignupError(error.response?.data?.message || "Failed to create account. Please try again.");
    } finally {
      setSignupLoading(false);
    }
  };

  // Render functions for each step
  const renderAccountDetails = () => (
    <>
      <div className="brand"><img src={logo} alt="CrewControl logo" /></div>
      <div className="auth-card auth-card-signup">
      <h2 className="auth-title">Create your account</h2>
      <p className="auth-subtitle">Just a few details to get you started.</p>

      {signupError && <p className="field-error">{signupError}</p>}

      <div className="form-group-row">
        <div className="form-group">
          <label>First Name<span>*</span></label>
          <input
            type="text"
            name="firstName"
            placeholder="Enter your First Name"
            value={formData.firstName}
            onChange={handleChange}
            className={errors.firstName ? "input-error" : ""}
          />
          {errors.firstName && <p className="field-error">{errors.firstName}</p>}
        </div>
        <div className="form-group">
          <label>Last Name<span>*</span></label>
          <input
            type="text"
            name="lastName"
            placeholder="Enter your Last Name"
            value={formData.lastName}
            onChange={handleChange}
            className={errors.lastName ? "input-error" : ""}
          />
          {errors.lastName && <p className="field-error">{errors.lastName}</p>}
        </div>
      </div>

      <div className="form-group">
        <label>Email<span>*</span></label>
        <input
          type="email"
          name="email"
          placeholder="Enter your Email"
          value={formData.email}
          onChange={handleChange}
          className={errors.email ? "input-error" : ""}
        />
        {errors.email && <p className="field-error">{errors.email}</p>}
      </div>

      <div className="form-group">
        <label>Password<span>*</span></label>
        <input
          type="password"
          name="password"
          placeholder="Enter your password"
          value={formData.password}
          onChange={handleChange}
          className={errors.password ? "input-error" : ""}
        />
        {errors.password && <p className="field-error">{errors.password}</p>}
      </div>

      <div className="form-group">
        <label>Confirm Password<span>*</span></label>
        <input
          type="password"
          name="confirmPassword"
          placeholder="Enter your password"
          value={formData.confirmPassword}
          onChange={handleChange}
          className={errors.confirmPassword ? "input-error" : ""}
        />
        {errors.confirmPassword && <p className="field-error">{errors.confirmPassword}</p>}
      </div>

      <button type="button" className="btn-primary" onClick={handleCreateAccount} disabled={signupLoading}>
        {signupLoading ? "Creating account..." : "Create Account"}
      </button>

      <button
        type="button"
        className="btn-google"
        onClick={() => {
          const apiBase = import.meta.env.VITE_API_URL || 'http://localhost:5000';
          const frontend = encodeURIComponent(window.location.origin);
          window.location.href = `${apiBase}/api/auth/google?flow=signup&frontend=${frontend}`;
        }}
      >
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
          <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/>
          <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
          <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/>
          <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
        </svg>
        Continue with Google
      </button>

      <p className="auth-footer">
        Already have an account? <a href="/signin" className="auth-link">Sign In</a>
      </p>
      </div>
    </>
  );

  const renderOTPVerification = () => {
    const enteredEmail = formData.email?.trim();

    const handleOtpChange = (value, index) => {
      if (!/^\d?$/.test(value)) return;
      const updated = [...otpValues];
      updated[index] = value;
      setOtpValues(updated);
      if (otpError) setOtpError("");
      if (value && index < 5) {
        otpInputsRef.current[index + 1]?.focus();
      }
    };

    const handleOtpKeyDown = (e, index) => {
      if (e.key !== "Backspace") return;
      e.preventDefault();
      const updated = [...otpValues];
      if (updated[index]) {
        updated[index] = "";
        setOtpValues(updated);
        return;
      }
      if (index > 0) {
        updated[index - 1] = "";
        setOtpValues(updated);
        otpInputsRef.current[index - 1]?.focus();
      }
    };

    const handleOtpVerify = async () => {
      setOtpError("");

      if (!enteredEmail) {
        setOtpError("Signup email is missing. Please go back and create account again.");
        return;
      }

      if (otpValues.some(v => v === "")) {
        setOtpError("Please enter complete OTP");
        return;
      }

      try {
        setOtpVerifyLoading(true);
        const response = await authApi.verifyOtp(enteredEmail, otpValues.join(""));
        const { token, user } = response.data;
        login(token, user);
        goToNextStep();
      } catch (error) {
        setOtpError(error.response?.data?.message || "Invalid OTP. Please try again.");
      } finally {
        setOtpVerifyLoading(false);
      }
    };

    const handleResendOtp = async () => {
      setOtpError("");

      if (!enteredEmail) {
        setOtpError("Signup email is missing. Please go back and create account again.");
        return;
      }

      try {
        setOtpResendLoading(true);
        await authApi.resendOtp(enteredEmail);
        setOtpValues(Array(6).fill(""));
        setOtpTimeLeft(240);
        otpInputsRef.current[0]?.focus();
      } catch (error) {
        setOtpError(error.response?.data?.message || "Failed to resend OTP. Please try again.");
      } finally {
        setOtpResendLoading(false);
      }
    };

    const formatOtpTime = (seconds) => {
      const mins = Math.floor(seconds / 60);
      const secs = seconds % 60;
      return `${mins}:${secs.toString().padStart(2, "0")}`;
    };

    return (
      <div className="auth-wrapper">
        <div className="brand"><img src={logo} alt="CrewControl logo" /></div>
        <div className="auth-card verify-email-card">
          <h2 className="verify-title">Check your email</h2>
          <p className="verify-description">
            We&apos;ve sent a confirmation code to {" "}
            <strong style={{ color: "#2b4eff" }}>{enteredEmail || "your email"}</strong>.
            {" "}It might take a moment to arrive.
          </p>

          {otpError && <p className="field-error" style={{ marginBottom: "16px" }}>{otpError}</p>}

          <div className="otp-box">
            {otpValues.map((digit, index) => (
              <input
                key={index}
                ref={(el) => {
                  if (el) otpInputsRef.current[index] = el;
                }}
                maxLength="1"
                value={digit}
                onChange={(e) => handleOtpChange(e.target.value, index)}
                onKeyDown={(e) => handleOtpKeyDown(e, index)}
                className="otp-input"
                placeholder=""
                type="text"
              />
            ))}
          </div>

          <div className="verify-timer">
            <button
              type="button"
              onClick={handleResendOtp}
              className="verify-resend-button"
              disabled={otpResendLoading || otpTimeLeft > 0}
            >
              {otpResendLoading
                ? "Sending..."
                : otpTimeLeft > 0
                  ? `Resend OTP in ${formatOtpTime(otpTimeLeft)}s`
                  : "Resend OTP"}
            </button>
          </div>

          <button type="button" className="btn-primary verify-btn" onClick={handleOtpVerify} disabled={otpVerifyLoading}>
            {otpVerifyLoading ? "Verifying..." : "Verify"}
          </button>

          <p className="auth-footer">
            Already have an account? <a href="/signin" className="auth-link">Sign In</a>
          </p>
        </div>
      </div>
    );
  };

  const renderBusinessDetails = () => (
    <div className="auth-wrapper onboarding-wrapper">
      <div className="brand"><img src={logo} alt="CrewControl logo" /></div>
      <div className="auth-card onboarding-card">
        <h2 className="onboarding-title">Set Up Your Company Profile</h2>
        <p className="onboarding-subtitle">
          This information will appear on your tax invoices and official documents.
          <br />
          Please ensure all details match your registered business records.
        </p>

        <h3 className="onboarding-section-title">Business Details</h3>

        <div className="form-group">
          <label>Company Legal Name<span>*</span></label>
          <input
            type="text"
            name="companyName"
            placeholder="Enter your registered company name"
            value={formData.companyName}
            onChange={handleChange}
            className={errors.companyName ? "onboarding-input-error" : ""}
          />
          {errors.companyName && <p className="onboarding-field-error">{errors.companyName}</p>}
        </div>

        <div className="form-group">
          <label>Tax Registration Number ( TRN ) <span>*</span></label>
          <input
            type="text"
            name="trn"
            placeholder="15-digit GST Identification Number"
            value={formData.trn}
            onChange={handleChange}
            className={errors.trn ? "onboarding-input-error" : ""}
          />
          {errors.trn && <p className="onboarding-field-error">{errors.trn}</p>}
        </div>

        <div className="form-group">
          <label>Company Website Link</label>
          <input
            type="url"
            name="website"
            placeholder="Enter your company website link"
            value={formData.website}
            onChange={handleChange}
          />
        </div>

        <div className="onboarding-actions">
          <button type="button" className="onboarding-link-button" onClick={handleSkip}>
            Skip
          </button>
          <div className="onboarding-right-actions">
            <button type="button" className="onboarding-link-button" onClick={handleBack}>
              Back
            </button>
            <button type="button" className="btn-primary onboarding-next-btn" onClick={handleNext}>
              Next
            </button>
          </div>
        </div>
      </div>
    </div>
  );

  const renderRegisteredAddress = () => (
    <div className="auth-wrapper onboarding-wrapper">
      <div className="brand"><img src={logo} alt="CrewControl logo" /></div>
      <div className="auth-card onboarding-card">
        <h2 className="onboarding-title">Set Up Your Company Profile</h2>
        <p className="onboarding-subtitle">
          This information will appear on your tax invoices and official documents.
          <br />
          Please ensure all details match your registered business records.
        </p>

        <h3 className="onboarding-section-title">Registered Address</h3>

        <div className="form-group">
          <label>Address<span>*</span></label>
          <input
            type="text"
            name="address"
            placeholder="Street address, area, landmark"
            value={formData.address}
            onChange={handleChange}
            className={errors.address ? "onboarding-input-error" : ""}
          />
          {errors.address && <p className="onboarding-field-error">{errors.address}</p>}
        </div>

        <div className="form-group">
          <label>City<span>*</span></label>
          <input
            type="text"
            name="city"
            placeholder="Enter your registered company name"
            value={formData.city}
            onChange={handleChange}
            className={errors.city ? "onboarding-input-error" : ""}
          />
          {errors.city && <p className="onboarding-field-error">{errors.city}</p>}
        </div>

        <div className="form-group">
          <label>Nationality</label>
          <div style={{ position: "relative" }} ref={nationDropdownRef}>
            <div
              onClick={() => setShowNationDropdown((s) => !s)}
              style={{ display: "flex", alignItems: "center", gap: "8px", padding: "10px 12px", border: `1px solid #DEDEDE`, borderRadius: "8px", cursor: "pointer", background: "#fff", minHeight: "44px" }}
            >
              <ReactCountryFlag countryCode={formData.nationality || "AE"} svg style={{ width: "18px", height: "12px" }} />
              <span style={{ color: formData.nationality ? "#141414" : "#808080" }}>{COUNTRY_CODES.find((c) => c.iso === formData.nationality)?.country || "Select"}</span>
            </div>

            {showNationDropdown && (
              <div style={{ position: "absolute", top: "50px", left: 0, width: "320px", maxHeight: "260px", border: `1px solid #DEDEDE`, borderRadius: "8px", background: "#fff", zIndex: 1200 }}>
                <input type="text" placeholder="Search..." value={nationSearch} onChange={(e) => setNationSearch(e.target.value)} style={{ width: "100%", padding: "8px", border: "none", borderBottom: `1px solid #DEDEDE`, outline: "none" }} />
                <div style={{ maxHeight: "200px", overflowY: "auto" }}>
                  {COUNTRY_CODES.filter((c) => !nationSearch || c.country.toLowerCase().includes(nationSearch.toLowerCase())).map((c) => (
                    <div key={c.iso} onClick={() => { setFormData((p) => ({ ...p, nationality: c.iso })); setShowNationDropdown(false); setNationSearch(""); }} style={{ display: "flex", alignItems: "center", gap: "10px", padding: "8px 12px", cursor: "pointer" }}>
                      <ReactCountryFlag countryCode={c.iso} svg style={{ width: "18px", height: "12px" }} />
                      <span style={{ fontSize: "13px", color: "#141414" }}>{c.country}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>

        <div className="onboarding-actions">
          <button type="button" className="onboarding-link-button" onClick={handleSkip}>
            Skip
          </button>
          <div className="onboarding-right-actions">
            <button type="button" className="onboarding-link-button" onClick={handleBack}>
              Back
            </button>
            <button type="button" className="btn-primary onboarding-next-btn" onClick={handleNext}>
              Next
            </button>
          </div>
        </div>
      </div>
    </div>
  );

  const renderContactInformation = () => (
    <div className="auth-wrapper onboarding-wrapper">
      <div className="brand"><img src={logo} alt="CrewControl logo" /></div>
      <div className="auth-card onboarding-card">
        <h2 className="onboarding-title">Set Up Your Company Profile</h2>
        <p className="onboarding-subtitle">
          This information will appear on your tax invoices and official documents.
          <br />
          Please ensure all details match your registered business records.
        </p>

        <h3 className="onboarding-section-title">Contact Information</h3>

        <div className="form-group">
          <label>Official Email<span>*</span></label>
          <input
            type="email"
            name="officialEmail"
            placeholder="Street address, area, landmark"
            value={formData.officialEmail}
            onChange={handleChange}
            className={errors.officialEmail ? "onboarding-input-error" : ""}
          />
          {errors.officialEmail && <p className="onboarding-field-error">{errors.officialEmail}</p>}
        </div>

        <div className="form-group">
          <label>Mobile Number<span>*</span></label>
          
          
          <div
  className={`onboarding-phone-wrapper ${errors.mobile ? "onboarding-input-error" : ""}`}
  style={{
    display: "flex",
    gap: 0,
    alignItems: "stretch",
    height: "44px",
    border: "1px solid #D1D5DB",
    borderRadius: "12px",
    backgroundColor: "#FFFFFF",
    overflow: "hidden",
  }}
>
  <div
    style={{
      display: "flex",
      alignItems: "center",
      height: "100%",
      borderRight: "1px solid #E5E7EB",
    }}
  >
    <div
      style={{
        position: "relative",
        width: "72px",
        flex: "0 0 72px",
        height: "100%",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
      }}
      ref={countryDropdownRef}
    >
      <ReactCountryFlag
        countryCode={selectedCountry.iso}
        svg
        style={{
          width: "30px",
          height: "20px",
          borderRadius: "2px",
        }}
      />

      <select
        value={formData.countryIso}
        onChange={handleCountrySelectChange}
        style={{
          position: "absolute",
          inset: 0,
          width: "100%",
          height: "100%",
          opacity: 0,
          border: "none",
          background: "transparent",
          cursor: "pointer",
          outline: "none",
        }}
      >
        {COUNTRY_CODES.map((c) => (
          <option key={c.iso} value={c.iso}>
            {c.country}
          </option>
        ))}
      </select>

      <div
        style={{
          position: "absolute",
          right: "8px",
          top: "50%",
          width: "10px",
          height: "6px",
          transform: "translateY(-50%)",
          pointerEvents: "none",
          backgroundImage:
            "url(\"data:image/svg+xml,%3Csvg width='10' height='6' viewBox='0 0 10 6' xmlns='http://www.w3.org/2000/svg'%3E%3Cpath d='M1 1L5 5L9 1' stroke='%23374151' stroke-width='1.5' stroke-linecap='round' stroke-linejoin='round'/%3E%3C/svg%3E\")",
          backgroundRepeat: "no-repeat",
          backgroundSize: "10px 6px",
        }}
      />
    </div>

    <input
      type="text"
      value={formData.countryCode}
      onChange={handleCountryCodeChange}
      placeholder="+1"
      style={{
        width: "66px",
        // flex: "0 0 76px",
        border: "none",
        borderRight: "none",
        padding: "0 8px 0 4px",
        fontSize: "14px",
        color: "#141414",
        height: "100%",
        outline: "none",
        background: "transparent",
        boxShadow: "none",
      }}
    />
  </div>

  <input
    type="tel"
    name="mobile"
    value={formData.mobile}
    onChange={handleChange}
    placeholder="__ __ __ __"
    style={{
      flex: 1,
      width: "auto",
      minWidth: 0,
      border: "none",
      borderRadius: 0,
      padding: "0 14px",
      fontSize: 14,
      height: "100%",
      outline: "none",
      background: "transparent",
      color: "#141414",
      boxShadow: "none",
    }}
  />
</div>
          {errors.mobile && <p className="onboarding-field-error">{errors.mobile}</p>}
        </div>

        <div className="onboarding-actions">
          <button type="button" className="onboarding-link-button" onClick={handleSkip}>
            Skip
          </button>
          <div className="onboarding-right-actions">
            <button type="button" className="onboarding-link-button" onClick={handleBack}>
              Back
            </button>
            <button type="button" className="btn-primary onboarding-next-btn" onClick={handleNext}>
              Next
            </button>
          </div>
        </div>
      </div>
    </div>
  );

  const renderLogoUpload = () => (
    <div className="auth-wrapper onboarding-wrapper">
      <div className="brand"><img src={logo} alt="CrewControl logo" /></div>
      <div className="auth-card onboarding-card">
        <h2 className="onboarding-title">Set Up Your Company Profile</h2>
        <p className="onboarding-subtitle">
          This information will appear on your tax invoices and official documents.
          <br />
          Please ensure all details match your registered business records.
        </p>

        <h3 className="onboarding-section-title">
          Company Stamp <span className="onboarding-optional">(Optional but Recommended)</span>
        </h3>

        <label className="onboarding-label">Upload Company Stamp</label>

        <div
          className={`onboarding-upload-area ${dragActive ? "drag-active" : ""} ${formData.stampPreview ? "has-preview" : ""}`}
          onDragEnter={handleFileDrag}
          onDragLeave={handleFileDrag}
          onDragOver={handleFileDrag}
          onDrop={(e) => handleFileDrop(e, "stamp")}
        >
          {formData.stampPreview ? (
            <div className="logo-preview-container" style={{ display: 'flex', alignItems: 'center', gap: '12px', padding: '10px', backgroundColor: '#f9fafb', borderRadius: '6px' }}>
              {typeof formData.stampPreview === 'string' && !formData.stampPreview.startsWith('data:image') ? (
                <>
                  <svg className="pdf-icon" width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                    <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path>
                    <polyline points="14 2 14 8 20 8"></polyline>
                  </svg>
                  <span style={{fontSize: '12px', color: '#666'}}>{formData.stampPreview}</span>
                </>
              ) : (
                <img src={formData.stampPreview} alt="Stamp" style={{maxWidth: '100px', maxHeight: '70px', borderRadius: '4px'}} />
              )}
              <button
                type="button"
                className="remove-logo-btn"
                onClick={() => setFormData((prev) => ({ ...prev, stamp: null, stampPreview: null }))}
              >
                Remove
              </button>
            </div>
          ) : (
            <>
              <svg className="upload-icon" width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path>
                <polyline points="17 8 12 3 7 8"></polyline>
                <line x1="12" y1="3" x2="12" y2="15"></line>
              </svg>
              <p className="upload-text">Drag and drop your company stamp file here</p>
              <p className="upload-hint">Accepted formats: PNG, JPG, PDF (Image Max 5MB, PDF Max 10MB)</p>
              <div className="upload-divider">- OR -</div>
              <button type="button" className="onboarding-browse-btn" onClick={handleBrowseClick}>
                Browse
              </button>
              <input
                ref={fileInputRef}
                type="file"
                hidden
                accept=".png,.jpg,.jpeg,.pdf"
                onChange={(e) => handleFileInputChange(e, "stamp")}
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
            <button type="button" className="btn-primary onboarding-next-btn" onClick={handleNext}>
              Next
            </button>
          </div>
        </div>
      </div>
    </div>
  );

  const renderTemplateUpload = () => (
    <div className="auth-wrapper onboarding-wrapper">
      <div className="brand"><img src={logo} alt="CrewControl logo" /></div>
      <div className="auth-card onboarding-card">
        <h2 className="onboarding-title">Set Up Your Company Profile</h2>
        <p className="onboarding-subtitle">
          This information will appear on your tax invoices and official documents.
          <br />
          Please ensure all details match your registered business records.
        </p>

        <h3 className="onboarding-section-title">Upload Your Company Template</h3>

        <label className="onboarding-label">Upload Template</label>

        <div
          className={`onboarding-upload-area ${dragActive ? "drag-active" : ""} ${formData.templatePreview ? "has-preview" : ""}`}
          onDragEnter={handleFileDrag}
          onDragLeave={handleFileDrag}
          onDragOver={handleFileDrag}
          onDrop={(e) => handleFileDrop(e, "template")}
        >
          {formData.templatePreview ? (
            <div className="template-preview-container">
              <svg className="pdf-icon" width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path>
                <polyline points="14 2 14 8 20 8"></polyline>
              </svg>
              <p className="template-name">{formData.templatePreview}</p>
              <button
                type="button"
                className="remove-template-btn"
                onClick={() => setFormData((prev) => ({ ...prev, template: null, templatePreview: null }))}
              >
                Remove
              </button>
            </div>
          ) : (
            <>
              <svg className="upload-icon" width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
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
                onChange={(e) => handleFileInputChange(e, "template")}
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
            <button type="button" className="btn-primary onboarding-next-btn" onClick={handleNext}>
              Next
            </button>
          </div>
        </div>
      </div>
    </div>
  );

  const renderSignatureUpload = () => (
    <div className="auth-wrapper onboarding-wrapper">
      <div className="brand"><img src={logo} alt="CrewControl logo" /></div>
      <div className="auth-card onboarding-card">
        <h2 className="onboarding-title">Set Up Your Company Profile</h2>
        <p className="onboarding-subtitle">
          This information will appear on your tax invoices and official documents.
          <br />
          Please ensure all details match your registered business records.
        </p>

        <h3 className="onboarding-section-title">Add Authorized Signature</h3>

        <label className="onboarding-label">Upload Signature</label>

        <div
          className={`onboarding-upload-area ${dragActive ? "drag-active" : ""} ${formData.signaturePreview ? "has-preview" : ""}`}
          onDragEnter={handleFileDrag}
          onDragLeave={handleFileDrag}
          onDragOver={handleFileDrag}
          onDrop={(e) => handleFileDrop(e, "signature")}
        >
          {formData.signaturePreview ? (
            <div className="template-preview-container">
              {formData.signature?.type === "application/pdf" || (typeof formData.signaturePreview === 'string' && !formData.signaturePreview.startsWith('data:image')) ? (
                <>
                  <svg className="pdf-icon" width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                    <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path>
                    <polyline points="14 2 14 8 20 8"></polyline>
                  </svg>
                  <p className="template-name" style={{fontSize: '12px', color: '#666'}}>{typeof formData.signaturePreview === 'string' ? formData.signaturePreview : 'PDF'}</p>
                </>
              ) : (
                <img src={formData.signaturePreview} alt="Signature" style={{maxWidth: '120px', maxHeight: '80px', borderRadius: '4px'}} />
              )}
              <button
                type="button"
                className="remove-template-btn"
                onClick={() => setFormData((prev) => ({ ...prev, signature: null, signaturePreview: null }))}
              >
                Remove
              </button>
            </div>
          ) : (
            <>
              <svg className="upload-icon" width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path>
                <polyline points="17 8 12 3 7 8"></polyline>
                <line x1="12" y1="3" x2="12" y2="15"></line>
              </svg>
              <p className="upload-text">Drag & drop your signature here</p>
              <p className="upload-hint">Accepted formats: PNG, JPG, PDF (Image Max 5MB, PDF Max 10MB)</p>
              <div className="upload-divider">- OR -</div>
              <button type="button" className="onboarding-browse-btn" onClick={handleBrowseClick}>
                Browse
              </button>
              <input
                ref={fileInputRef}
                type="file"
                hidden
                accept=".png,.jpg,.jpeg,.pdf"
                onChange={(e) => handleFileInputChange(e, "signature")}
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
            <button type="button" className="btn-primary onboarding-next-btn" onClick={handleSave} disabled={onboardingSaving}>
              {onboardingSaving ? 'Saving...' : 'Save'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );

  const renderSuccess = () => (
    <div className="auth-wrapper onboarding-wrapper">
      <div className="brand"><img src={logo} alt="CrewControl logo" /></div>
      <div className="auth-card onboarding-card onboarding-success-card">
        <div className="success-icon-container">
          <svg className="success-icon" width="80" height="80" viewBox="0 0 24 24" fill="currentColor">
            <circle cx="12" cy="12" r="10" fill="#2b4eff" />
            <path d="M9 12.5l2 2 4-5" stroke="white" strokeWidth="2" fill="none" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </div>
        <h2 className="success-title">Secure Save Confirmation!</h2>
        <p className="success-subtitle">Your information has been securely saved.</p>
        <button type="button" className="btn-primary success-continue-btn" onClick={handleContinue}>
          Continue
        </button>
      </div>
    </div>
  );

  // Main render
  const stepRenderers = {
    [STEPS.ACCOUNT_DETAILS]: renderAccountDetails,
    [STEPS.ACCOUNT_INFO]: renderOTPVerification,
    [STEPS.BUSINESS]: renderBusinessDetails,
    [STEPS.ADDRESS]: renderRegisteredAddress,
    [STEPS.CONTACT]: renderContactInformation,
    [STEPS.LOGO]: renderLogoUpload,
    [STEPS.TEMPLATE]: renderTemplateUpload,
    [STEPS.SIGNATURE]: renderSignatureUpload,
    [STEPS.SUCCESS]: renderSuccess
  };

  return (
    <div className="auth-wrapper">
      {step === STEPS.ACCOUNT_DETAILS || step === STEPS.ACCOUNT_INFO ? (
        stepRenderers[step]()
      ) : (
        stepRenderers[step]()
      )}
    </div>
  );
}
