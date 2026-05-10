import { useMemo, useState, useRef, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import "../styles/auth.css";
import { clampMobileByCountry } from "../utils/phoneValidation";
import { COUNTRIES_LIST } from "../utils/countriesData";
import ReactCountryFlag from "react-country-flag";

const STEPS = {
  BUSINESS: 0,
  ADDRESS: 1,
  CONTACT: 2
};

const COUNTRY_CODES = COUNTRIES_LIST.map((country) => ({
  code: country.phoneCode,
  country: country.name,
  flag: country.flag,
  iso: country.isoCode,
}));

export default function OnboardingCompanyProfile() {
  const navigate = useNavigate();
  const [step, setStep] = useState(STEPS.BUSINESS);
  const [errors, setErrors] = useState({});
  // Dropdown state for country code and nationality (matches AddEmployee behaviour)
  const [showCountryDropdown, setShowCountryDropdown] = useState(false);
  const [countrySearch, setCountrySearch] = useState("");
  const countryDropdownRef = useRef(null);

  const [showNationDropdown, setShowNationDropdown] = useState(false);
  const [nationSearch, setNationSearch] = useState("");
  const nationDropdownRef = useRef(null);
  const [formData, setFormData] = useState({
    companyName: "",
    trn: "",
    website: "",
    address: "",
    city: "",
    nationality: "",
    email: "",
    countryCode: "+91",
    mobile: ""
  });

  const totalSteps = useMemo(() => 3, []);

  const handleChange = (e) => {
    const { name, value } = e.target;
    setFormData((prev) => {
      if (name === "mobile") {
        return {
          ...prev,
          mobile: clampMobileByCountry(value, { countryCode: prev.countryCode }),
        };
      }

      return { ...prev, [name]: value };
    });
    setErrors((prev) => ({ ...prev, [name]: "" }));
  };

  useEffect(() => {
    const handleClickOutside = (event) => {
      if (countryDropdownRef.current && !countryDropdownRef.current.contains(event.target)) {
        setShowCountryDropdown(false);
        setCountrySearch("");
      }
      if (nationDropdownRef.current && !nationDropdownRef.current.contains(event.target)) {
        setShowNationDropdown(false);
        setNationSearch("");
      }
    };

    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const validateStep = () => {
    const nextErrors = {};

    if (step === STEPS.BUSINESS) {
      if (!formData.companyName.trim()) nextErrors.companyName = "Company legal name is required";
      if (!formData.trn.trim()) nextErrors.trn = "Tax Registration Number is required";
    }

    if (step === STEPS.ADDRESS) {
      if (!formData.address.trim()) nextErrors.address = "Address is required";
      if (!formData.city.trim()) nextErrors.city = "City is required";
    }

    if (step === STEPS.CONTACT) {
      if (!formData.email.trim()) nextErrors.email = "Official email is required";
      if (!formData.mobile.trim()) nextErrors.mobile = "Mobile number is required";
    }

    setErrors(nextErrors);
    return Object.keys(nextErrors).length === 0;
  };

  const goToNextStep = () => {
    if (step < totalSteps - 1) {
      setStep((prev) => prev + 1);
      return;
    }
    navigate("/");
  };

  const handleSkip = () => {
    setErrors({});
    goToNextStep();
  };

  const handleBack = () => {
    if (step > STEPS.BUSINESS) {
      setErrors({});
      setStep((prev) => prev - 1);
      return;
    }
    navigate("/signup");
  };

  const handleNext = (e) => {
    e.preventDefault();
    if (!validateStep()) return;
    goToNextStep();
  };

  return (
    <div className="auth-wrapper onboarding-wrapper">
      <div className="brand"><img src={import.meta.env.BASE_URL + 'crewio_logo.png'} alt="CrewControl logo" /></div>

      <div className="auth-card onboarding-card">
        <h2 className="onboarding-title">Set Up Your Company Profile</h2>
        <p className="onboarding-subtitle">
          This information will appear on your tax invoices and official documents.
          <br />
          Please ensure all details match your official records.
        </p>

        <form onSubmit={handleNext} noValidate>
          <h3 className="onboarding-section-title">
            {step === STEPS.BUSINESS
              ? "Business Details"
              : step === STEPS.ADDRESS
                ? "Registered Address"
                : "Contact Information"}
          </h3>

          {step === STEPS.BUSINESS && (
            <>
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
                  type="text"
                  name="website"
                  placeholder="Enter your company website link"
                  value={formData.website}
                  onChange={handleChange}
                />
              </div>
            </>
          )}

          {step === STEPS.ADDRESS && (
            <>
              <div className="form-group">
                <label>Address <span>*</span></label>
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
                <label>City <span>*</span></label>
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
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: "8px",
                      padding: "10px 12px",
                      border: `1px solid #DEDEDE`,
                      borderRadius: "8px",
                      cursor: "pointer",
                      background: "#fff",
                      minHeight: "44px",
                    }}
                  >
                    <ReactCountryFlag countryCode={formData.nationality || "AE"} svg style={{ width: "18px", height: "12px" }} />
                    <span style={{ color: formData.nationality ? "#141414" : "#808080" }}>
                      {COUNTRY_CODES.find((c) => c.iso === formData.nationality)?.country || "Select"}
                    </span>
                  </div>

                  {showNationDropdown && (
                    <div style={{ position: "absolute", top: "50px", left: 0, width: "320px", maxHeight: "260px", border: `1px solid #DEDEDE`, borderRadius: "8px", background: "#fff", zIndex: 1200 }}>
                      <input
                        type="text"
                        placeholder="Search..."
                        value={nationSearch}
                        onChange={(e) => setNationSearch(e.target.value)}
                        style={{ width: "100%", padding: "8px", border: "none", borderBottom: `1px solid #DEDEDE`, outline: "none" }}
                      />
                      <div style={{ maxHeight: "200px", overflowY: "auto" }}>
                        {COUNTRY_CODES.filter((c) => !nationSearch || c.country.toLowerCase().includes(nationSearch.toLowerCase())).map((c) => (
                          <div
                            key={c.iso}
                            onClick={() => { setFormData((p) => ({ ...p, nationality: c.iso })); setShowNationDropdown(false); setNationSearch(""); }}
                            style={{ display: "flex", alignItems: "center", gap: "10px", padding: "8px 12px", cursor: "pointer" }}
                          >
                            <ReactCountryFlag countryCode={c.iso} svg style={{ width: "18px", height: "12px" }} />
                            <span style={{ fontSize: "13px", color: "#141414" }}>{c.country}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </>
          )}

          {step === STEPS.CONTACT && (
            <>
              <div className="form-group">
                <label>Official Email <span>*</span></label>
                <input
                  type="email"
                  name="email"
                  placeholder="Street address, area, landmark"
                  value={formData.email}
                  onChange={handleChange}
                  className={errors.email ? "onboarding-input-error" : ""}
                />
                {errors.email && <p className="onboarding-field-error">{errors.email}</p>}
              </div>

              <div className="form-group">
                <label>Mobile Number <span>*</span></label>
                <div style={{ display: "flex", gap: "8px" }}>
                  <div style={{ position: "relative", width: "180px" }} ref={countryDropdownRef}>
                    <div
                      onClick={() => setShowCountryDropdown((s) => !s)}
                      style={{ display: "flex", alignItems: "center", gap: "8px", padding: "10px 12px", border: `1px solid #DEDEDE`, borderRadius: "8px", cursor: "pointer", background: "#fff", height: "44px" }}
                    >
                      <ReactCountryFlag countryCode={COUNTRY_CODES.find((c) => c.code === formData.countryCode)?.iso || "AE"} svg style={{ width: "18px", height: "12px" }} />
                      <span style={{ color: "#141414" }}>{formData.countryCode}</span>
                    </div>

                    {showCountryDropdown && (
                      <div style={{ position: "absolute", top: "50px", left: 0, width: "240px", maxHeight: "260px", border: `1px solid #DEDEDE`, borderRadius: "8px", background: "#fff", zIndex: 1200 }}>
                        <input
                          type="text"
                          placeholder="Search..."
                          value={countrySearch}
                          onChange={(e) => setCountrySearch(e.target.value)}
                          style={{ width: "100%", padding: "8px", border: "none", borderBottom: `1px solid #DEDEDE`, outline: "none" }}
                        />
                        <div style={{ maxHeight: "200px", overflowY: "auto" }}>
                          {COUNTRY_CODES.filter((c) => !countrySearch || c.country.toLowerCase().includes(countrySearch.toLowerCase()) || c.code.includes(countrySearch)).map((c) => (
                            <div
                              key={c.iso}
                              onClick={() => { setFormData((p) => ({ ...p, countryCode: c.code })); setShowCountryDropdown(false); setCountrySearch(""); }}
                              style={{ display: "flex", alignItems: "center", gap: "10px", padding: "8px 12px", cursor: "pointer" }}
                            >
                              <ReactCountryFlag countryCode={c.iso} svg style={{ width: "18px", height: "12px" }} />
                              <span>{c.code}</span>
                              <span style={{ fontSize: "12px", color: "#888" }}>{c.country}</span>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>

                  <input
                    type="tel"
                    name="mobile"
                    placeholder="_ _ _ _ _ _ _ _"
                    value={formData.mobile}
                    onChange={handleChange}
                    className={`onboarding-phone-input ${errors.mobile ? "onboarding-input-error" : ""}`}
                    style={{ flex: 1 }}
                  />
                </div>
                {errors.mobile && <p className="onboarding-field-error">{errors.mobile}</p>}
              </div>
            </>
          )}

          <div className="onboarding-actions">
            <button type="button" className="onboarding-link-button" onClick={handleSkip}>
              Skip
            </button>
            <div className="onboarding-right-actions">
              <button type="button" className="onboarding-link-button" onClick={handleBack}>
                Back
              </button>
              <button type="submit" className="btn-primary onboarding-next-btn">
                Next
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
}
