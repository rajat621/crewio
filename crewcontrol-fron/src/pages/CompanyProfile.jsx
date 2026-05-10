import { Box, Button, TextField, Typography, Avatar, IconButton, Select, MenuItem, Alert, CircularProgress, InputAdornment } from "@mui/material";
import { useState, useRef, useEffect } from "react";
import { useAuth } from "../context/AuthContext";
import ReactCountryFlag from "react-country-flag";
import AddAPhotoIcon from "@mui/icons-material/AddAPhoto";
import WarningAmberRoundedIcon from "@mui/icons-material/WarningAmberRounded";
import { companiesApi } from "../api/companies";
import { clampMobileByCountry } from "../utils/phoneValidation";
import { getCountries, getCountryByIso, getCountryByPhoneCode } from "../utils/locationService";

const COUNTRY_CODES = getCountries();

const normalizeCountryCode = (value) => {
  if (!value) return "+91";
  if (String(value).startsWith("+")) return value;
  return getCountryByIso(value)?.phoneCode || "+91";
};

const normalizeCountryIso = (value) => {
  if (!value) return "IN";
  if (String(value).startsWith("+")) return getCountryByPhoneCode(value)?.isoCode || "IN";
  return getCountryByIso(value)?.isoCode || "IN";
};

const getPreviewKind = (value) => {
  if (typeof value !== "string" || !value.trim()) return null;

  const lowerValue = value.toLowerCase();

  if (lowerValue.startsWith("data:application/pdf") || lowerValue.includes(".pdf")) {
    return "pdf";
  }

  if (lowerValue.startsWith("data:image/") || /\.(png|jpe?g|webp|gif|bmp|svg)(\?|#|$)/.test(lowerValue)) {
    return "image";
  }
  return null;
};

const getPreviewMimeType = (value) => {
  if (typeof value !== "string" || !value.trim()) return "application/octet-stream";

  const lowerValue = value.toLowerCase();

  if (lowerValue.startsWith("data:application/pdf") || lowerValue.includes(".pdf")) {
    return "application/pdf";
  }

  if (lowerValue.startsWith("data:image/png") || lowerValue.includes(".png")) return "image/png";
  if (lowerValue.startsWith("data:image/jpeg") || lowerValue.includes(".jpg") || lowerValue.includes(".jpeg")) return "image/jpeg";
  if (lowerValue.startsWith("data:image/webp") || lowerValue.includes(".webp")) return "image/webp";
  if (lowerValue.startsWith("data:image/gif") || lowerValue.includes(".gif")) return "image/gif";
  if (lowerValue.startsWith("data:image/svg+xml") || lowerValue.includes(".svg")) return "image/svg+xml";

  if (lowerValue.startsWith("data:image/")) return lowerValue.slice(5, lowerValue.indexOf(";")) || "image/*";

  return "application/octet-stream";
};

const EditStrokeIcon = ({ color = '#6B7280' }) => (
  <svg
    viewBox="0 0 24 24"
    fill="none"
    stroke={color}
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
    style={{ width: '14px', height: '14px' }}
    aria-hidden="true"
  >
    <path d="M12 20h9" />
    <path d="M16.5 3.5a2.121 2.121 0 1 1 3 3L7 19l-4 1 1-4 12.5-12.5z" />
  </svg>
);

const UploadedPreview = ({ value, label, onOpen }) => {
  if (!value) return null;
  const previewKind = getPreviewKind(value);

  if (previewKind === "pdf") {
    return (
      <Box
        title={onOpen ? "Open in new tab" : undefined}
        onClick={onOpen}
        role={onOpen ? "button" : undefined}
        tabIndex={onOpen ? 0 : undefined}
        onKeyDown={(event) => {
          if (!onOpen) return;
          if (event.key === "Enter" || event.key === " ") {
            event.preventDefault();
            onOpen();
          }
        }}
        sx={{
          display: "flex",
          alignItems: "center",
          gap: "12px",
          cursor: onOpen ? "pointer" : "default",
        }}
      >
        <Box
          sx={{
            width: "40px",
            height: "40px",
            backgroundColor: "#E85D5D",
            borderRadius: "6px",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            fontSize: "12px",
            fontWeight: 600,
            color: "#FFFFFF",
          }}
        >
          PDF
        </Box>
        <Typography sx={{ fontSize: 14, color: "#808080" }}>{label}.pdf</Typography>
      </Box>
    );
  }

  if (previewKind === "image") {
    return (
      <Box
        title={onOpen ? "Open in new tab" : undefined}
        onClick={onOpen}
        role={onOpen ? "button" : undefined}
        tabIndex={onOpen ? 0 : undefined}
        onKeyDown={(event) => {
          if (!onOpen) return;
          if (event.key === "Enter" || event.key === " ") {
            event.preventDefault();
            onOpen();
          }
        }}
        sx={{
          display: "inline-flex",
          cursor: onOpen ? "pointer" : "default",
        }}
      >
        <Box
          component="img"
          src={value}
          alt={`${label} preview`}
          sx={{
            maxWidth: "200px",
            maxHeight: "100px",
            borderRadius: "8px",
            border: "1px solid #E5E7EB",
            padding: "8px",
            backgroundColor: "#FFFFFF",
          }}
        />
      </Box>
    );
  }

  return (
    <Typography sx={{ fontSize: 14, color: "#808080" }}>
      {label}
    </Typography>
  );
};

function CompanyProfile() {
  const { user, isLoading: authLoading } = useAuth();
  const fileInputRef = useRef(null);
  const logoInputRef = useRef(null);
  const signatureInputRef = useRef(null);
  const stampInputRef = useRef(null);

  // Tab management
  const [activeTab, setActiveTab] = useState("Details");

  // Edit modes - one for each section
  const [isEditingHeader, setIsEditingHeader] = useState(false);
  const [isEditingCompanyDetails, setIsEditingCompanyDetails] = useState(false);
  const [isEditingAddress, setIsEditingAddress] = useState(false);
  const [isEditingContact, setIsEditingContact] = useState(false);
  const [isEditingTemplate, setIsEditingTemplate] = useState(false);
  const [isEditingSignature, setIsEditingSignature] = useState(false);
  const [isEditingStamp, setIsEditingStamp] = useState(false);

  // Edit button hover states
  const [editHeaderHover, setEditHeaderHover] = useState(false);
  const [editCompanyDetailsHover, setEditCompanyDetailsHover] = useState(false);
  const [editAddressHover, setEditAddressHover] = useState(false);
  const [editContactHover, setEditContactHover] = useState(false);
  const [editTemplateHover, setEditTemplateHover] = useState(false);
  const [editSignatureHover, setEditSignatureHover] = useState(false);
  const [editStampHover, setEditStampHover] = useState(false);

  // Loading and alerts
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState(null);
  const [success, setSuccess] = useState(null);

  // Company data
  const [companyData, setCompanyData] = useState({
    _id: "",
    name: "",
    companyLegalName: "",
    trn: "",
    websiteLink: "",
    address: "",
    city: "",
    nationality: "",
    contactEmail: "",
    mobileNumber: "",
    countryIso: "IN",
    countryCode: "+91",
    logo: null,
    invoiceTemplate: null,
    signature: null,
    stamp: null,
  });

  const [originalData, setOriginalData] = useState(companyData);

  // Fetch company data after auth is resolved and user is available
  useEffect(() => {
    if (!authLoading && user) {
      fetchCompanyData();
    }
  }, [user, authLoading]);

  const fetchCompanyData = async () => {
    try {
      setIsLoading(true);
      setError(null);

      // Fetch owner company via owner-specific endpoint
      console.log('CompanyProfile: resolved user for company fetch', user);
      const response = await companiesApi.getOwnerCompany();
      if (response.data?.data) {
        const company = response.data.data;
        const companyId = company._id || company.id || "";
        setCompanyData({
          _id: companyId,
          name: company.name || "",
          companyLegalName: company.companyLegalName || "",
          trn: company.trn || "",
          websiteLink: company.websiteLink || "",
          address: company.address || "",
          city: company.city || "",
          nationality: company.nationality || "",
          contactEmail: company.contactEmail || "",
          mobileNumber: company.mobileNumber || "",
          countryIso: normalizeCountryIso(company.countryCode),
          countryCode: normalizeCountryCode(company.countryCode),
          logo: company.logo || null,
          invoiceTemplate: company.invoiceTemplate || null,
          signature: company.signature || null,
          stamp: company.stamp || null,
        });
      }
    } catch (err) {
      console.error("Error fetching company data:", err);
      if (err.response?.status === 404) {
        // No owner company yet is a valid state. Keep the form editable and allow Save to create it.
        setError(null);
        setCompanyData((prev) => ({
          ...prev,
          _id: "",
        }));
      } else {
        setError(err.response?.data?.message || "Failed to load company data");
      }
    } finally {
      setIsLoading(false);
    }
  };

  // Handle input change
  const handleInputChange = (field, value) => {
    setCompanyData((prev) => ({ ...prev, [field]: value }));
    setError(null);
  };

  const handleCountrySelectChange = (event) => {
    const selectedIso = event.target.value;
    const selectedCountry = COUNTRY_CODES.find((item) => item.isoCode === selectedIso);

    setCompanyData((prev) => ({
      ...prev,
      countryIso: selectedIso,
      countryCode: selectedCountry?.phoneCode || prev.countryCode,
      mobileNumber: clampMobileByCountry(prev.mobileNumber, {
        countryIso: selectedIso,
        countryCode: selectedCountry?.phoneCode || prev.countryCode,
      }),
    }));
    setError(null);
  };

  const handleCountryCodeChange = (event) => {
    const nextCode = event.target.value;
    const matchedCountry = COUNTRY_CODES.find((item) => item.phoneCode === nextCode);

    setCompanyData((prev) => ({
      ...prev,
      countryCode: nextCode,
      countryIso: matchedCountry?.isoCode || prev.countryIso,
      mobileNumber: clampMobileByCountry(prev.mobileNumber, {
        countryIso: matchedCountry?.isoCode || prev.countryIso,
        countryCode: nextCode,
      }),
    }));
    setError(null);
  };

  const handleMobileNumberChange = (event) => {
    const nextMobile = clampMobileByCountry(event.target.value, {
      countryIso: companyData.countryIso,
      countryCode: companyData.countryCode,
    });
    handleInputChange("mobileNumber", nextMobile);
  };

  const handleLogoClick = () => {
    logoInputRef.current?.click();
  };

  const handleLogoFileChange = (event) => {
    const file = event.target.files?.[0];
    if (file) {
      if (!file.type.startsWith("image/")) {
        setError("Please select a valid image file");
        return;
      }
      if (file.size > 5 * 1024 * 1024) {
        setError("Image size must be less than 5MB");
        return;
      }

      const reader = new FileReader();
      reader.onload = (e) => {
        handleInputChange("logo", e.target?.result);
      };
      reader.onerror = () => {
        setError("Failed to read image file");
      };
      reader.readAsDataURL(file);
    }
  };

  const handleTemplateFileChange = (event) => {
    const file = event.target.files?.[0];
    if (file) {
      // Allow PDF or image for template (user can choose)
      const isPdf = file.type === "application/pdf";
      const isImage = file.type.startsWith("image/");
      if (!isPdf && !isImage) {
        setError("Please select a PDF or image file");
        return;
      }
      const maxSize = isPdf ? 10 * 1024 * 1024 : 5 * 1024 * 1024;
      if (file.size > maxSize) {
        setError(isPdf ? "PDF size must be less than 10MB" : "Image size must be less than 5MB");
        return;
      }

      const reader = new FileReader();
      reader.onload = (e) => {
        handleInputChange("invoiceTemplate", e.target?.result);
      };
      reader.onerror = () => {
        setError("Failed to read file");
      };
      reader.readAsDataURL(file);
    }
  };

  const handleSignatureFileChange = (event) => {
    const file = event.target.files?.[0];
    if (file) {
      const isPdf = file.type === "application/pdf";
      const isImage = file.type.startsWith("image/");
      if (!isPdf && !isImage) {
        setError("Please select a PDF or image file");
        return;
      }
      const maxSize = isPdf ? 10 * 1024 * 1024 : 5 * 1024 * 1024;
      if (file.size > maxSize) {
        setError(isPdf ? "PDF size must be less than 10MB" : "Image size must be less than 5MB");
        return;
      }

      const reader = new FileReader();
      reader.onload = (e) => {
        handleInputChange("signature", e.target?.result);
      };
      reader.onerror = () => {
        setError("Failed to read file");
      };
      reader.readAsDataURL(file);
    }
  };

  const handleStampFileChange = (event) => {
    const file = event.target.files?.[0];
    if (file) {
      const isPdf = file.type === "application/pdf";
      const isImage = file.type.startsWith("image/");
      if (!isPdf && !isImage) {
        setError("Please select a PDF or image file");
        return;
      }
      const maxSize = isPdf ? 10 * 1024 * 1024 : 5 * 1024 * 1024;
      if (file.size > maxSize) {
        setError(isPdf ? "PDF size must be less than 10MB" : "Image size must be less than 5MB");
        return;
      }

      const reader = new FileReader();
      reader.onload = (e) => {
        handleInputChange("stamp", e.target?.result);
      };
      reader.onerror = () => {
        setError("Failed to read file");
      };
      reader.readAsDataURL(file);
    }
  };

  const handleRemoveLogo = () => {
    handleInputChange("logo", null);
  };

  const handleRemoveTemplate = () => {
    handleInputChange("invoiceTemplate", null);
  };

  const handleRemoveSignature = () => {
    handleInputChange("signature", null);
  };

  const handleRemoveStamp = () => {
    handleInputChange("stamp", null);
  };

  // Edit handlers
  const handleEditHeader = (event) => {
    try {
      event?.currentTarget?.blur?.();
    } catch (e) {}
    setOriginalData(companyData);
    setIsEditingHeader(true);
  };

  const handleEditCompanyDetails = (event) => {
    try {
      event?.currentTarget?.blur?.();
    } catch (e) {}
    setOriginalData(companyData);
    setIsEditingCompanyDetails(true);
  };

  const handleEditAddress = (event) => {
    try {
      event?.currentTarget?.blur?.();
    } catch (e) {}
    setOriginalData(companyData);
    setIsEditingAddress(true);
  };

  const handleEditContact = (event) => {
    try {
      event?.currentTarget?.blur?.();
    } catch (e) {}
    setOriginalData(companyData);
    setIsEditingContact(true);
  };

  const handleEditTemplate = (event) => {
    try {
      event?.currentTarget?.blur?.();
    } catch (e) {}
    setOriginalData(companyData);
    setIsEditingTemplate(true);
  };

  const handleEditSignature = (event) => {
    try {
      event?.currentTarget?.blur?.();
    } catch (e) {}
    setOriginalData(companyData);
    setIsEditingSignature(true);
  };

  const handleEditStamp = (event) => {
    try {
      event?.currentTarget?.blur?.();
    } catch (e) {}
    setOriginalData(companyData);
    setIsEditingStamp(true);
  };

  // Handle Cancel
  const handleCancel = () => {
    setCompanyData(originalData);
    setIsEditingHeader(false);
    setIsEditingCompanyDetails(false);
    setIsEditingAddress(false);
    setIsEditingContact(false);
    setIsEditingTemplate(false);
    setIsEditingSignature(false);
    setIsEditingStamp(false);
    setError(null);
  };

  // Validate form data
  const validateFormData = () => {
    if (isEditingCompanyDetails) {
      if (!companyData.name?.trim()) {
        setError("Company name is required");
        return false;
      }
    }
    if (isEditingContact) {
      if (companyData.contactEmail && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(companyData.contactEmail)) {
        setError("Please enter a valid email address");
        return false;
      }
      if (companyData.mobileNumber && !/^\+?[\d\s\-()]+$/.test(companyData.mobileNumber)) {
        setError("Invalid phone number format");
        return false;
      }
    }
    return true;
  };

  // Handle Save
  const handleSave = async () => {
    if (!validateFormData()) {
      return;
    }

    setIsSaving(true);
    setError(null);
    setSuccess(null);

    try {
      const updatePayload = {};

      if (isEditingHeader) {
        if (companyData.logo !== originalData.logo) {
          updatePayload.logo = companyData.logo || null;
        }
        if (companyData.name !== originalData.name) {
          updatePayload.name = companyData.name.trim();
        }
        if (companyData.websiteLink !== originalData.websiteLink) {
          updatePayload.websiteLink = companyData.websiteLink.trim();
        }
      }

      if (isEditingCompanyDetails) {
        if (companyData.name !== originalData.name) {
          updatePayload.name = companyData.name.trim();
        }
        if (companyData.companyLegalName !== originalData.companyLegalName) {
          updatePayload.companyLegalName = companyData.companyLegalName.trim();
        }
        if (companyData.trn !== originalData.trn) {
          updatePayload.trn = companyData.trn.trim();
        }
        if (companyData.websiteLink !== originalData.websiteLink) {
          updatePayload.websiteLink = companyData.websiteLink.trim();
        }
      }

      if (isEditingAddress) {
        if (companyData.address !== originalData.address) {
          updatePayload.address = companyData.address.trim();
        }
        if (companyData.city !== originalData.city) {
          updatePayload.city = companyData.city.trim();
        }
        if (companyData.nationality !== originalData.nationality) {
          updatePayload.nationality = companyData.nationality;
        }
      }

      if (isEditingContact) {
        if (companyData.contactEmail !== originalData.contactEmail) {
          updatePayload.contactEmail = companyData.contactEmail.trim();
        }
        if (companyData.mobileNumber !== originalData.mobileNumber) {
          updatePayload.mobileNumber = companyData.mobileNumber;
        }
        if (companyData.countryCode !== originalData.countryCode) {
          updatePayload.countryCode = companyData.countryCode;
        }
      }

      if (isEditingTemplate) {
        if (companyData.invoiceTemplate !== originalData.invoiceTemplate) {
          updatePayload.invoiceTemplate = companyData.invoiceTemplate || null;
        }
      }

      if (isEditingStamp) {
        if (companyData.stamp !== originalData.stamp) {
          updatePayload.stamp = companyData.stamp || null;
        }
      }

      if (isEditingSignature) {
        if (companyData.signature !== originalData.signature) {
          updatePayload.signature = companyData.signature || null;
        }
      }

      console.log('💾 Company update payload:', { companyId: companyData._id, updatePayload, isEditingHeader, isEditingCompanyDetails, isEditingAddress, isEditingContact, isEditingTemplate, isEditingSignature, isEditingStamp });

      // If there are no actual fields to update, don't call the owner upsert endpoint
      // (creating an owner requires at minimum a `name` field). Inform the user
      // to provide required details first.
      if (Object.keys(updatePayload).length === 0) {
        setError('Please provide company details (for example, company name) before saving.');
        setIsSaving(false);
        return;
      }

      // Set owner role and call owner upsert endpoint.
      updatePayload.companyRole = 'owner';

      const ownerResp = await companiesApi.updateOwnerCompany(updatePayload);
      if (ownerResp.data?.data) {
        setCompanyData({
          ...companyData,
          ...ownerResp.data.data,
        });
        setSuccess("Company profile updated successfully");
        setIsEditingHeader(false);
        setIsEditingCompanyDetails(false);
        setIsEditingAddress(false);
        setIsEditingContact(false);
        setIsEditingTemplate(false);
        setIsEditingSignature(false);
        setIsEditingStamp(false);

        setTimeout(() => setSuccess(null), 3000);
      }
      setIsSaving(false);
      return;

      // Defensive: ensure we have a valid company id before calling the backend for non-owner updates.
      if (!companyData._id) {
        setError('Cannot update company: missing company id. Please reload the page or contact support.');
        setIsSaving(false);
        return;
      }

      const resp = await companiesApi.updateCompany(companyData._id, updatePayload);

      if (resp.data?.data) {
        setCompanyData({
          ...companyData,
          ...resp.data.data,
        });
        setSuccess("Company profile updated successfully");
        setIsEditingHeader(false);
        setIsEditingCompanyDetails(false);
        setIsEditingAddress(false);
        setIsEditingContact(false);
        setIsEditingTemplate(false);
        setIsEditingSignature(false);
        setIsEditingStamp(false);

        setTimeout(() => setSuccess(null), 3000);
      }
    } catch (err) {
      console.error("Company update error:", err);
      setError(err.response?.data?.message || "Failed to update company profile. Please try again.");
    } finally {
      setIsSaving(false);
    }
  };

  const selectedCountry = COUNTRY_CODES.find((item) => item.isoCode === companyData.countryIso) || COUNTRY_CODES[1];

  const formattedDisplayMobile = (() => {
    const mobile = companyData.mobileNumber?.trim();
    const code = companyData.countryCode?.trim();

    if (!mobile) return "-";

    if (mobile.startsWith("+")) {
      if (code && mobile.startsWith(code)) {
        const rest = mobile.slice(code.length).replace(/^[\s-]+/, "").trim();
        return rest ? `${code} ${rest}` : code;
      }
      return mobile;
    }

    return code ? `${code} ${mobile}` : mobile;
  })();

  const openDocumentPreview = async (value) => {
    if (!value) return;

    const previewWindow = window.open("about:blank", "_blank");
    if (!previewWindow) {
      window.location.assign(value);
      return;
    }

    try {
      const response = await fetch(value, { credentials: "include" });
      if (!response.ok) {
        previewWindow.location.href = value;
        return;
      }

      const blob = await response.blob();
      const mimeType = blob.type || getPreviewMimeType(value);
      const objectUrl = URL.createObjectURL(blob.type ? blob : new Blob([blob], { type: mimeType }));
      previewWindow.location.href = objectUrl;
      setTimeout(() => URL.revokeObjectURL(objectUrl), 60_000);
    } catch (err) {
      console.error("Failed to open document preview:", err);
      previewWindow.location.href = value;
    }
  };

  if (isLoading) {
    return (
      <Box
        sx={{
          flex: 1,
          minHeight: "100vh",
          backgroundColor: "#F7F5FF",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <CircularProgress />
      </Box>
    );
  }

  return (
    <Box
      sx={{
        flex: 1,
        minHeight: "100vh",
        backgroundColor: "#F7F5FF",
        px: "40px",
        py: "24px",
      }}
    >
      <Box
        sx={{
          backgroundColor: "#FFFFFF",
          border: "1px solid #E5E7EB",
          borderRadius: "10px",
          p: "24px",
        }}
      >
        {/* TITLE */}
        <Typography
          sx={{
            fontSize: "18px",
            fontWeight: 600,
            color: "#111827",
            mb: 3,
          }}
        >
          Company Profile
        </Typography>

        {/* ALERTS */}
        {error && (
          <Alert severity="error" sx={{ mb: "16px" }}>
            {error}
          </Alert>
        )}

        {success && (
          <Alert severity="success" sx={{ mb: "16px" }}>
            {success}
          </Alert>
        )}

        {/* COMPANY HEADER CARD */}
        <Box
          sx={{
            border: "1px solid #E5E7EB",
            borderRadius: "8px",
            py: "20px",
            px: "16px",
            // mb: "16px",
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
          }}
        >
          <Box sx={{ display: "flex", alignItems: "center", gap: "20px" }}>
            {/* LOGO */}
            <Box sx={{ position: "relative" }}>
              <Avatar
                src={companyData.logo}
                sx={{
                  width: 92,
                  height: 92,
                  bgcolor: "#D1D5DB",
                  fontSize: 30,
                  cursor: isEditingHeader ? "pointer" : "default",
                }}
                onClick={isEditingHeader ? handleLogoClick : undefined}
              >
                {!companyData.logo && companyData.name?.[0]}
              </Avatar>

              {isEditingHeader && (
                <IconButton
                  onClick={handleLogoClick}
                  sx={{
                    position: "absolute",
                    bottom: 0,
                    right: 0,
                    backgroundColor: "#1D4ED8",
                    color: "#FFFFFF",
                    width: 36,
                    height: 36,
                    "&:hover": { backgroundColor: "#1E40AF" },
                  }}
                >
                  <AddAPhotoIcon sx={{ fontSize: 18 }} />
                </IconButton>
              )}

              <input
                ref={logoInputRef}
                type="file"
                accept="image/*"
                hidden
                onChange={handleLogoFileChange}
              />
            </Box>

            {/* COMPANY NAME + EMAIL + WEBSITE */}
            <Box>
              <Typography
                sx={{
                  fontSize: "24px",
                  fontWeight: 600,
                  color: "#141414",
                }}
              >
                {companyData.name}
              </Typography>

              <Typography
                sx={{
                  fontSize: "14px",
                  color: "#5F5F6F",
                  mt: "6px",
                }}
              >
                {companyData.contactEmail || "-"}
              </Typography>

              <Typography
                sx={{
                  fontSize: "14px",
                  color: "#5F5F6F",
                }}
              >
                {companyData.websiteLink || "-"}
              </Typography>
            </Box>
          </Box>

          {/* EDIT / SAVE / CANCEL */}
          {!isEditingHeader && !isEditingCompanyDetails && !isEditingAddress && !isEditingContact && !isEditingTemplate && !isEditingSignature ? (
            <Button
              startIcon={<EditStrokeIcon color={editHeaderHover ? '#1D4ED8' : '#6B7280'} />}
              onClick={handleEditHeader}
              onMouseEnter={() => setEditHeaderHover(true)}
              onMouseLeave={() => setEditHeaderHover(false)}
              onMouseDown={(e) => e.currentTarget.blur()}
              onMouseUp={() => setEditHeaderHover(false)}
              onBlur={() => setEditHeaderHover(false)}
              sx={{
                alignSelf: "flex-start",
                border: `1px solid ${editHeaderHover ? '#93C5FD' : '#D1D5DB'}`,
                color: editHeaderHover ? "#1D4ED8" : "#6B7280",
                backgroundColor: editHeaderHover ? "#EFF6FF" : "#FFFFFF",
                borderRadius: "8px",
                textTransform: "none",
                px: "16px",
                height: "32px",
                minHeight: "32px",
                transition: "all 0.2s ease",
                outline: "none",
                boxShadow: "none",
              }}
            >
              Edit
            </Button>
          ) : isEditingHeader ? (
            <Box sx={{ display: "flex", gap: "12px", alignSelf: "flex-start" }}>
              {companyData.logo && (
                <Button
                  onClick={handleRemoveLogo}
                  disabled={isSaving}
                  sx={{
                    textTransform: "none",
                    color: "#DC2626",
                    border: "1px solid #FECACA",
                    borderRadius: "8px",
                    px: "16px",
                    height: "32px",
                    minHeight: "32px",
                    "&:hover": {
                      borderColor: "#FCA5A5",
                      backgroundColor: "#FEF2F2",
                    },
                  }}
                >
                  Remove Logo
                </Button>
              )}
              <Button
                onClick={handleCancel}
                disabled={isSaving}
                sx={{
                  textTransform: "none",
                  color: "#1D4ED8",
                  // border: "1px solid #D1D5DB",
                  borderRadius: "8px",
                  px: "20px",
                  height: "32px",
                  minHeight: "32px",
                }}
              >
                Cancel
              </Button>

              <Button
                onClick={handleSave}
                disabled={isSaving}
                variant="contained"
                sx={{
                  textTransform: "none",
                  backgroundColor: "#1D4ED8",
                  borderRadius: "8px",
                  px: "20px",
                  height: "32px",
                  minHeight: "32px",
                }}
              >
                {isSaving ? <CircularProgress size={20} color="inherit" /> : "Save"}
              </Button>
            </Box>
          ) : null}
        </Box>

        {/* TABS */}
        <Box
          sx={{
            display: "flex",
            gap: "8px",
            // mb: "16px",
            pt: "16px",
            pb: "16px",
          }}
        >
          {["Details", "Contact", "Document"].map((tab) => (
            <Button
              key={tab}
              type="button"
              disableRipple
              className={activeTab === tab ? "active" : ""}
              onClick={() => setActiveTab(tab)}
              sx={{
                textTransform: "none",
                fontSize: "14px",
                borderRadius: "0",
                fontWeight: activeTab === tab ? 600 : 400,
                color: activeTab === tab ? "#1D4ED8" : "#6B7280",
                pb: "8px",
                borderBottom: "2px solid transparent",
                "&:hover": {
                  backgroundColor: "transparent",
                  borderBottom: "2px solid transparent",
                },
                "&:focus": {
                  outline: "none",
                  borderBottom: "2px solid transparent",
                },
                "&:active": {
                  borderBottom: "2px solid transparent",
                },
                "&.active": {
                  borderBottom: "2px solid #1D4ED8",
                },
              }}
            >
              {tab}
            </Button>
          ))}
        </Box>

        {/* DETAILS TAB */}
        {activeTab === "Details" && (
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: '24px', alignItems: 'flex-start' }}>
            {/* COMPANY DETAILS SECTION */}
            <Box
              sx={{
                border: "1px solid #E5E7EB",
                borderRadius: "8px",
                p: "20px",
                mb: "16px",
                width: '100%',
              }}
            >
              {/* HEADER */}
              <Box
                sx={{
                  display: "flex",
                  justifyContent: "space-between",
                  mb: "24px",
                }}
              >
                <Typography
                  sx={{
                    fontSize: "14px",
                    fontWeight: 600,
                    color: "#141414",
                  }}
                >
                  Company Details
                </Typography>

                {!isEditingHeader && !isEditingCompanyDetails && !isEditingAddress && !isEditingContact && !isEditingTemplate && !isEditingSignature ? (
                  <Button
                    startIcon={<EditStrokeIcon color={editCompanyDetailsHover ? '#1D4ED8' : '#6B7280'} />}
                    onClick={handleEditCompanyDetails}
                    onMouseEnter={() => setEditCompanyDetailsHover(true)}
                    onMouseLeave={() => setEditCompanyDetailsHover(false)}
                    onMouseDown={(e) => e.currentTarget.blur()}
                    onMouseUp={() => setEditCompanyDetailsHover(false)}
                    onBlur={() => setEditCompanyDetailsHover(false)}
                    sx={{
                      border: `1px solid ${editCompanyDetailsHover ? '#93C5FD' : '#D1D5DB'}`,
                      color: editCompanyDetailsHover ? "#1D4ED8" : "#6B7280",
                      backgroundColor: editCompanyDetailsHover ? "#EFF6FF" : "#FFFFFF",
                      borderRadius: "8px",
                      textTransform: "none",
                      px: "16px",
                      height: "32px",
                      minHeight: "32px",
                      transition: "all 0.2s ease",
                      outline: "none",
                      boxShadow: "none",
                    }}
                  >
                    Edit
                  </Button>
                ) : isEditingCompanyDetails ? (
                  <Box sx={{ display: "flex", gap: "12px" }}>
                    <Button
                      onClick={handleCancel}
                      disabled={isSaving}
                      sx={{
                        textTransform: "none",
                        color: "#1D4ED8",
                        // border: "1px solid #D1D5DB",
                        borderRadius: "8px",
                        px: "20px",
                        height: "32px",
                        minHeight: "32px",
                      }}
                    >
                      Cancel
                    </Button>

                    <Button
                      onClick={handleSave}
                      disabled={isSaving}
                      variant="contained"
                      sx={{
                        textTransform: "none",
                        backgroundColor: "#1D4ED8",
                        borderRadius: "8px",
                        px: "20px",
                        height: "32px",
                        minHeight: "32px",
                      }}
                    >
                      {isSaving ? <CircularProgress size={20} color="inherit" /> : "Save"}
                    </Button>
                  </Box>
                ) : null}
              </Box>

              {/* FORM GRID */}
              <Box
                sx={{
                  display: "grid",
                  gridTemplateColumns: "1fr 1fr",
                  gap: "20px",
                }}
              >
                {/* COMPANY NAME */}
                <Box>
                  <Typography
                    sx={{
                      fontSize: 14,
                      color: "#808080",
                      mb: "8px",
                      fontWeight: 400,
                    }}
                  >
                    Company Name
                  </Typography>
                  {isEditingCompanyDetails ? (
                    <TextField
                      fullWidth
                      value={companyData.name}
                      onChange={(e) => handleInputChange("name", e.target.value)}
                      sx={{
                        "& .MuiOutlinedInput-root": {
                          height: "44px",
                          fontSize: 14,
                          backgroundColor: "#FFFFFF",
                          borderRadius: "8px",
                          border: "1px solid #DEDEDE",
                          color: "#141414",
                        },
                      }}
                    />
                  ) : (
                    <Typography sx={{ fontSize: 14, color: "#808080" }}>
                      {companyData.name || "-"}
                    </Typography>
                  )}
                </Box>

                {/* COMPANY LEGAL NAME */}
                <Box>
                  <Typography
                    sx={{
                      fontSize: 14,
                      color: "#808080",
                      mb: "8px",
                      fontWeight: 400,
                    }}
                  >
                    Company Legal Name
                  </Typography>
                  {isEditingCompanyDetails ? (
                    <TextField
                      fullWidth
                      value={companyData.companyLegalName}
                      onChange={(e) => handleInputChange("companyLegalName", e.target.value)}
                      sx={{
                        "& .MuiOutlinedInput-root": {
                          height: "44px",
                          fontSize: 14,
                          backgroundColor: "#FFFFFF",
                          borderRadius: "8px",
                          border: "1px solid #DEDEDE",
                          color: "#141414",
                        },
                      }}
                    />
                  ) : (
                    <Typography sx={{ fontSize: 14, color: "#808080" }}>
                      {companyData.companyLegalName || "-"}
                    </Typography>
                  )}
                </Box>

                {/* TAX REGISTRATION NUMBER */}
                <Box>
                  <Typography
                    sx={{
                      fontSize: 14,
                      color: "#808080",
                      mb: "8px",
                      fontWeight: 400,
                    }}
                  >
                    Tax Registration Number (TRN)
                  </Typography>
                  {isEditingCompanyDetails ? (
                    <TextField
                      fullWidth
                      value={companyData.trn}
                      onChange={(e) => handleInputChange("trn", e.target.value)}
                      sx={{
                        "& .MuiOutlinedInput-root": {
                          height: "44px",
                          fontSize: 14,
                          backgroundColor: "#FFFFFF",
                          borderRadius: "8px",
                          border: "1px solid #DEDEDE",
                          color: "#141414",
                        },
                      }}
                    />
                  ) : (
                    <Typography sx={{ fontSize: 14, color: "#808080" }}>
                      {companyData.trn || "-"}
                    </Typography>
                  )}
                </Box>

                {/* COMPANY WEBSITE LINK */}
                <Box>
                  <Typography
                    sx={{
                      fontSize: 14,
                      color: "#808080",
                      mb: "8px",
                      fontWeight: 400,
                    }}
                  >
                    Company Website Link
                  </Typography>
                  {isEditingCompanyDetails ? (
                    <TextField
                      fullWidth
                      value={companyData.websiteLink}
                      onChange={(e) => handleInputChange("websiteLink", e.target.value)}
                      sx={{
                        "& .MuiOutlinedInput-root": {
                          height: "44px",
                          fontSize: 14,
                          backgroundColor: "#FFFFFF",
                          borderRadius: "8px",
                          border: "1px solid #DEDEDE",
                          color: "#141414",
                        },
                      }}
                    />
                  ) : (
                    <Typography sx={{ fontSize: 14, color: "#808080" }}>
                      {companyData.websiteLink || "-"}
                    </Typography>
                  )}
                </Box>
              </Box>
            </Box>

            {/* REGISTERED ADDRESS SECTION */}
            <Box
              sx={{
                border: "1px solid #E5E7EB",
                borderRadius: "8px",
                p: "20px",
                width: '100%',
              }}
            >
              {/* HEADER */}
              <Box
                sx={{
                  display: "flex",
                  justifyContent: "space-between",
                  mb: "24px",
                }}
              >
                <Typography
                  sx={{
                    fontSize: "14px",
                    fontWeight: 600,
                    color: "#141414",
                  }}
                >
                  Registered Address
                </Typography>

                {!isEditingHeader && !isEditingCompanyDetails && !isEditingAddress && !isEditingContact && !isEditingTemplate && !isEditingSignature ? (
                  <Button
                    startIcon={<EditStrokeIcon color={editAddressHover ? '#1D4ED8' : '#6B7280'} />}
                    onClick={handleEditAddress}
                    onMouseEnter={() => setEditAddressHover(true)}
                    onMouseLeave={() => setEditAddressHover(false)}
                    onMouseDown={(e) => e.currentTarget.blur()}
                    onMouseUp={() => setEditAddressHover(false)}
                    onBlur={() => setEditAddressHover(false)}
                    sx={{
                      border: `1px solid ${editAddressHover ? '#93C5FD' : '#D1D5DB'}`,
                      color: editAddressHover ? "#1D4ED8" : "#6B7280",
                      backgroundColor: editAddressHover ? "#EFF6FF" : "#FFFFFF",
                      borderRadius: "8px",
                      textTransform: "none",
                      px: "16px",
                      height: "32px",
                      minHeight: "32px",
                      transition: "all 0.2s ease",
                      outline: "none",
                      boxShadow: "none",
                    }}
                  >
                    Edit
                  </Button>
                ) : isEditingAddress ? (
                  <Box sx={{ display: "flex", gap: "12px" }}>
                    <Button
                      onClick={handleCancel}
                      disabled={isSaving}
                      sx={{
                        textTransform: "none",
                        color: "#1D4ED8",
                        // border: "1px solid #D1D5DB",
                        borderRadius: "8px",
                        px: "20px",
                        height: "32px",
                        minHeight: "32px",
                      }}
                    >
                      Cancel
                    </Button>

                    <Button
                      onClick={handleSave}
                      disabled={isSaving}
                      variant="contained"
                      sx={{
                        textTransform: "none",
                        backgroundColor: "#1D4ED8",
                        borderRadius: "8px",
                        px: "20px",
                        height: "32px",
                        minHeight: "32px",
                      }}
                    >
                      {isSaving ? <CircularProgress size={20} color="inherit" /> : "Save"}
                    </Button>
                  </Box>
                ) : null}
              </Box>

              {/* FORM GRID */}
              <Box
                sx={{
                  display: "grid",
                  gridTemplateColumns: "1fr 1fr",
                  gap: "20px",
                }}
              >
                {/* ADDRESS */}
                <Box sx={{ gridColumn: "1 / -1" }}>
                  <Typography
                    sx={{
                      fontSize: 14,
                      color: "#808080",
                      mb: "8px",
                      fontWeight: 400,
                    }}
                  >
                    Address
                  </Typography>
                  {isEditingAddress ? (
                    <TextField
                      fullWidth
                      multiline
                      rows={3}
                      value={companyData.address}
                      onChange={(e) => handleInputChange("address", e.target.value)}
                      sx={{
                        "& .MuiOutlinedInput-root": {
                          fontSize: 14,
                          backgroundColor: "#FFFFFF",
                          borderRadius: "8px",
                          border: "1px solid #DEDEDE",
                          color: "#141414",
                        },
                      }}
                    />
                  ) : (
                    <Typography sx={{ fontSize: 14, color: "#808080" }}>
                      {companyData.address || "-"}
                    </Typography>
                  )}
                </Box>

                {/* CITY */}
                <Box>
                  <Typography
                    sx={{
                      fontSize: 14,
                      color: "#808080",
                      mb: "8px",
                      fontWeight: 400,
                    }}
                  >
                    City
                  </Typography>
                  {isEditingAddress ? (
                    <TextField
                      fullWidth
                      value={companyData.city}
                      onChange={(e) => handleInputChange("city", e.target.value)}
                      sx={{
                        "& .MuiOutlinedInput-root": {
                          height: "44px",
                          fontSize: 14,
                          backgroundColor: "#FFFFFF",
                          borderRadius: "8px",
                          border: "1px solid #DEDEDE",
                          color: "#141414",
                        },
                      }}
                    />
                  ) : (
                    <Typography sx={{ fontSize: 14, color: "#808080" }}>
                      {companyData.city || "-"}
                    </Typography>
                  )}
                </Box>

                {/* NATIONALITY */}
                <Box>
                  <Typography
                    sx={{
                      fontSize: 14,
                      color: "#808080",
                      mb: "8px",
                      fontWeight: 400,
                    }}
                  >
                    Nationality
                  </Typography>
                  {isEditingAddress ? (
                    <Select
                      fullWidth
                      value={companyData.nationality}
                      onChange={(e) => handleInputChange("nationality", e.target.value)}
                      sx={{
                        height: "44px",
                        fontSize: 14,
                        backgroundColor: "#FFFFFF",
                        borderRadius: "8px",
                        border: "1px solid #DEDEDE",
                        color: "#141414",
                      }}
                    >
                      <MenuItem value="">Select Nationality</MenuItem>
                      {COUNTRY_CODES.map((country) => (
                        <MenuItem key={country.isoCode} value={country.isoCode}>
                          {country.name}
                        </MenuItem>
                      ))}
                    </Select>
                  ) : (
                    <Typography sx={{ fontSize: 14, color: "#808080" }}>
                      {companyData.nationality || "-"}
                    </Typography>
                  )}
                </Box>
              </Box>
            </Box>
          </Box>
        )}

        {/* CONTACT TAB */}
        {activeTab === "Contact" && (
          <Box
            sx={{
              border: "1px solid #E5E7EB",
              borderRadius: "8px",
              p: "20px",
            }}
          >
            {/* HEADER */}
            <Box
              sx={{
                display: "flex",
                justifyContent: "space-between",
                mb: "24px",
              }}
            >
              <Typography
                sx={{
                  fontSize: "14px",
                  fontWeight: 600,
                  color: "#141414",
                }}
              >
                Contact Information
              </Typography>

              {!isEditingHeader && !isEditingCompanyDetails && !isEditingAddress && !isEditingContact && !isEditingTemplate && !isEditingSignature ? (
                <Button
                  startIcon={<EditStrokeIcon color={editContactHover ? '#1D4ED8' : '#6B7280'} />}
                  onClick={handleEditContact}
                  onMouseEnter={() => setEditContactHover(true)}
                  onMouseLeave={() => setEditContactHover(false)}
                  onMouseDown={(e) => e.currentTarget.blur()}
                  onMouseUp={() => setEditContactHover(false)}
                  onBlur={() => setEditContactHover(false)}
                  sx={{
                    border: `1px solid ${editContactHover ? '#93C5FD' : '#D1D5DB'}`,
                    color: editContactHover ? "#1D4ED8" : "#6B7280",
                    backgroundColor: editContactHover ? "#EFF6FF" : "#FFFFFF",
                    borderRadius: "8px",
                    textTransform: "none",
                    px: "16px",
                    height: "32px",
                    minHeight: "32px",
                    transition: "all 0.2s ease",
                    outline: "none",
                    boxShadow: "none",
                  }}
                >
                  Edit
                </Button>
              ) : isEditingContact ? (
                <Box sx={{ display: "flex", gap: "12px" }}>
                  <Button
                    onClick={handleCancel}
                    disabled={isSaving}
                    sx={{
                      textTransform: "none",
                      color: "#1D4ED8",
                      // border: "1px solid #D1D5DB",
                      borderRadius: "8px",
                      px: "20px",
                      height: "32px",
                      minHeight: "32px",
                    }}
                  >
                    Cancel
                  </Button>

                  <Button
                    onClick={handleSave}
                    disabled={isSaving}
                    variant="contained"
                    sx={{
                      textTransform: "none",
                      backgroundColor: "#1D4ED8",
                      borderRadius: "8px",
                      px: "20px",
                      height: "32px",
                      minHeight: "32px",
                    }}
                  >
                    {isSaving ? <CircularProgress size={20} color="inherit" /> : "Save"}
                  </Button>
                </Box>
              ) : null}
            </Box>

            {/* FORM GRID */}
            <Box
              sx={{
                display: "grid",
                gridTemplateColumns: "1fr 1fr",
                gap: "20px",
              }}
            >
              {/* OFFICIAL EMAIL */}
              <Box sx={{ gridColumn: "1 / -1" }}>
                <Typography
                  sx={{
                    fontSize: 14,
                    color: "#808080",
                    mb: "8px",
                    fontWeight: 400,
                  }}
                >
                  Official Email
                </Typography>
                {isEditingContact ? (
                  <TextField
                    fullWidth
                    type="email"
                    value={companyData.contactEmail}
                    onChange={(e) => handleInputChange("contactEmail", e.target.value)}
                    sx={{
                      "& .MuiOutlinedInput-root": {
                        height: "44px",
                        fontSize: 14,
                        backgroundColor: "#FFFFFF",
                        borderRadius: "8px",
                        border: "1px solid #DEDEDE",
                        color: "#141414",
                      },
                    }}
                  />
                ) : (
                  <Typography sx={{ fontSize: 14, color: "#808080" }}>
                    {companyData.contactEmail || "-"}
                  </Typography>
                )}
              </Box>

              {/* MOBILE NUMBER */}
              <Box sx={{ gridColumn: "1 / -1" }}>
                <Typography
                  sx={{
                    fontSize: 14,
                    color: "#808080",
                    mb: "8px",
                    fontWeight: 400,
                  }}
                >
                  Mobile Number
                </Typography>
                {isEditingContact ? (
                  <Box
                    sx={{
                      display: "flex",
                      gap: 0,
                      alignItems: "stretch",
                      height: "44px",
                      border: "1px solid #D1D5DB",
                      borderRadius: "12px",
                      backgroundColor: "#FFFFFF",
                      overflow: "hidden",
                      "&:focus-within": {
                        borderColor: "#2B4EFF",
                      },
                    }}
                  >
                    <Box
                      sx={{
                        display: "flex",
                        alignItems: "center",
                        height: "100%",
                        borderRight: "1px solid #E5E7EB",
                      }}
                    >
                      <Box
                        sx={{
                          position: "relative",
                          width: "72px",
                          flex: "0 0 72px",
                          height: "100%",
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "center",
                        }}
                      >
                        <ReactCountryFlag
                          countryCode={selectedCountry.isoCode}
                          svg
                          style={{ width: "30px", height: "20px", borderRadius: "2px" }}
                        />

                        <Box
                          component="select"
                          value={companyData.countryIso}
                          onChange={handleCountrySelectChange}
                          sx={{
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
                          {COUNTRY_CODES.map((country) => (
                            <option key={country.isoCode} value={country.isoCode}>
                              {country.name}
                            </option>
                          ))}
                        </Box>

                        <Box
                          sx={{
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
                      </Box>

                      <Box
                        component="input"
                        type="text"
                        value={companyData.countryCode}
                        onChange={handleCountryCodeChange}
                        placeholder="+1"
                        sx={{
                          width: "76px",
                          flex: "0 0 76px",
                          border: "none",
                          borderRight: "none",
                          padding: "0 8px 0 4px",
                          fontSize: 14,
                          color: "#141414",
                          height: "100%",
                          outline: "none",
                          background: "transparent",
                          boxShadow: "none",
                        }}
                      />
                    </Box>

                    <Box
                      component="input"
                      type="tel"
                      value={companyData.mobileNumber}
                      onChange={handleMobileNumberChange}
                      placeholder="__ __ __ __"
                      sx={{
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
                  </Box>
                ) : (
                  <Box sx={{ display: "flex", alignItems: "center", gap: "10px" }}>
                    {formattedDisplayMobile !== "-" && (
                      <ReactCountryFlag
                        countryCode={selectedCountry.isoCode}
                        svg
                        style={{ width: "30px", height: "20px", borderRadius: "2px" }}
                      />
                    )}
                    <Typography sx={{ fontSize: 14, color: "#808080" }}>
                      {formattedDisplayMobile}
                    </Typography>
                  </Box>
                )}
              </Box>
            </Box>
          </Box>
        )}

        {/* DOCUMENT TAB */}
        {activeTab === "Document" && (
          <Box>
            {/* COMPANY TEMPLATE SECTION */}
            <Box
              sx={{
                border: "1px solid #E5E7EB",
                borderRadius: "8px",
                p: "20px",
                mb: "16px",
              }}
            >
              {/* HEADER */}
              <Box
                sx={{
                  display: "flex",
                  justifyContent: "space-between",
                  mb: "24px",
                }}
              >
                <Typography
                  sx={{
                    fontSize: "14px",
                    fontWeight: 600,
                    color: "#141414",
                  }}
                >
                  Company Template
                </Typography>

                {!isEditingHeader && !isEditingCompanyDetails && !isEditingAddress && !isEditingContact && !isEditingTemplate && !isEditingSignature ? (
                  <Button
                    startIcon={<EditStrokeIcon color={editTemplateHover ? '#1D4ED8' : '#6B7280'} />}
                    onClick={handleEditTemplate}
                    onMouseEnter={() => setEditTemplateHover(true)}
                    onMouseLeave={() => setEditTemplateHover(false)}
                    onMouseDown={(e) => e.currentTarget.blur()}
                    onMouseUp={() => setEditTemplateHover(false)}
                    onBlur={() => setEditTemplateHover(false)}
                    sx={{
                      border: `1px solid ${editTemplateHover ? '#93C5FD' : '#D1D5DB'}`,
                      color: editTemplateHover ? "#1D4ED8" : "#6B7280",
                      backgroundColor: editTemplateHover ? "#EFF6FF" : "#FFFFFF",
                      borderRadius: "8px",
                      textTransform: "none",
                      px: "16px",
                      height: "32px",
                      minHeight: "32px",
                      transition: "all 0.2s ease",
                      outline: "none",
                      boxShadow: "none",
                    }}
                  >
                    Edit
                  </Button>
                ) : isEditingTemplate ? (
                  <Box sx={{ display: "flex", gap: "12px" }}>
                    <Button
                      onClick={handleCancel}
                      disabled={isSaving}
                      sx={{
                        textTransform: "none",
                        color: "#1D4ED8",
                        // border: "1px solid #D1D5DB",
                        borderRadius: "8px",
                        px: "20px",
                        height: "32px",
                        minHeight: "32px",
                      }}
                    >
                      Cancel
                    </Button>

                    <Button
                      onClick={handleSave}
                      disabled={isSaving}
                      variant="contained"
                      sx={{
                        textTransform: "none",
                        backgroundColor: "#1D4ED8",
                        borderRadius: "8px",
                        px: "20px",
                        height: "32px",
                        minHeight: "32px",
                      }}
                    >
                      {isSaving ? <CircularProgress size={20} color="inherit" /> : "Save"}
                    </Button>
                  </Box>
                ) : null}
              </Box>

              {/* CONTENT */}
              {isEditingTemplate ? (
                <Box>
                  {companyData.invoiceTemplate && (
                    <Box
                      sx={{
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "space-between",
                        gap: "12px",
                        p: "12px",
                        mb: "12px",
                        backgroundColor: "#F9FAFB",
                        borderRadius: "8px",
                        border: "1px solid #E5E7EB",
                      }}
                    >
                        <UploadedPreview
                          value={companyData.invoiceTemplate}
                          label="Template"
                          onOpen={() => openDocumentPreview(companyData.invoiceTemplate)}
                        />

                      <Button
                        onClick={handleRemoveTemplate}
                        disabled={isSaving}
                        sx={{
                          textTransform: "none",
                          color: "#DC2626",
                          border: "1px solid #FECACA",
                          borderRadius: "8px",
                          px: "14px",
                          height: "30px",
                          minHeight: "30px",
                          "&:hover": {
                            borderColor: "#FCA5A5",
                            backgroundColor: "#FEF2F2",
                          },
                        }}
                      >
                        Remove
                      </Button>
                    </Box>
                  )}

                  <Box
                    sx={{
                      border: "2px dashed #D1D5DB",
                      borderRadius: "8px",
                      p: "20px",
                      textAlign: "center",
                      cursor: "pointer",
                      backgroundColor: "#F9FAFB",
                      "&:hover": {
                        backgroundColor: "#F3F4F6",
                      },
                    }}
                    onClick={() => fileInputRef.current?.click()}
                  >
                    <Typography sx={{ fontSize: 14, color: "#6B7280", mb: "8px" }}>
                      {companyData.invoiceTemplate
                        ? "Click to upload a different template"
                        : "Click to upload or drag and drop"}
                    </Typography>
                    <Typography sx={{ fontSize: 12, color: "#9CA3AF" }}>
                      PDF or image (max. 10MB for PDF, 5MB for images)
                    </Typography>
                    <input
                      ref={fileInputRef}
                      type="file"
                      accept="application/pdf,image/*"
                      hidden
                      onChange={handleTemplateFileChange}
                    />
                  </Box>
                </Box>
              ) : (
                <Box>
                  {companyData.invoiceTemplate ? (
                    <Box sx={{ display: "flex", alignItems: "center", gap: "12px", p: "12px", backgroundColor: "#F9FAFB", borderRadius: "8px" }}>
                      <UploadedPreview
                        value={companyData.invoiceTemplate}
                        label="Template"
                        onOpen={() => openDocumentPreview(companyData.invoiceTemplate)}
                      />
                    </Box>
                  ) : (
                    <Typography sx={{ fontSize: 14, color: "#808080" }}>-</Typography>
                  )}
                </Box>
              )}
            </Box>
            {/* Stamp SECTION */}
            <Box
              sx={{
                border: "1px solid #E5E7EB",
                borderRadius: "8px",
                p: "20px",
              }}
            >
              {/* HEADER */}
              <Box
                sx={{
                  display: "flex",
                  justifyContent: "space-between",
                  mb: "24px",
                }}
              >
                <Typography
                  sx={{
                    fontSize: "14px",
                    fontWeight: 600,
                    color: "#141414",
                  }}
                >
                  Stamp
                </Typography>

                {!isEditingHeader && !isEditingCompanyDetails && !isEditingAddress && !isEditingContact && !isEditingTemplate && !isEditingSignature && !isEditingStamp ? (
                  <Button
                    startIcon={<EditStrokeIcon color={editStampHover ? '#1D4ED8' : '#6B7280'} />}
                    onClick={handleEditStamp}
                    onMouseEnter={() => setEditStampHover(true)}
                    onMouseLeave={() => setEditStampHover(false)}
                    onMouseDown={(e) => e.currentTarget.blur()}
                    onMouseUp={() => setEditStampHover(false)}
                    onBlur={() => setEditStampHover(false)}
                    sx={{
                      border: `1px solid ${editStampHover ? '#93C5FD' : '#D1D5DB'}`,
                      color: editStampHover ? "#1D4ED8" : "#6B7280",
                      backgroundColor: editStampHover ? "#EFF6FF" : "#FFFFFF",
                      borderRadius: "8px",
                      textTransform: "none",
                      px: "16px",
                      height: "32px",
                      minHeight: "32px",
                      transition: "all 0.2s ease",
                      outline: "none",
                      boxShadow: "none",
                    }}
                  >
                    Edit
                  </Button>
                ) : isEditingStamp ? (
                  <Box sx={{ display: "flex", gap: "12px" }}>
                    <Button
                      onClick={handleCancel}
                      disabled={isSaving}
                      sx={{
                        textTransform: "none",
                        color: "#1D4ED8",
                        // border: "1px solid #D1D5DB",
                        borderRadius: "8px",
                        px: "20px",
                        height: "32px",
                        minHeight: "32px",
                      }}
                    >
                      Cancel
                    </Button>

                    <Button
                      onClick={handleSave}
                      disabled={isSaving}
                      variant="contained"
                      sx={{
                        textTransform: "none",
                        backgroundColor: "#1D4ED8",
                        borderRadius: "8px",
                        px: "20px",
                        height: "32px",
                        minHeight: "32px",
                      }}
                    >
                      {isSaving ? <CircularProgress size={20} color="inherit" /> : "Save"}
                    </Button>
                  </Box>
                ) : null}
              </Box>

              {/* CONTENT */}
              {isEditingStamp ? (
                <Box>
                  {companyData.stamp && (
                    <Box
                      sx={{
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "space-between",
                        gap: "12px",
                        p: "12px",
                        mb: "12px",
                        backgroundColor: "#F9FAFB",
                        borderRadius: "8px",
                        border: "1px solid #E5E7EB",
                      }}
                    >
                      <UploadedPreview
                        value={companyData.stamp}
                        label="Stamp"
                        onOpen={() => openDocumentPreview(companyData.stamp)}
                      />

                      <Button
                        onClick={handleRemoveStamp}
                        disabled={isSaving}
                        sx={{
                          textTransform: "none",
                          color: "#DC2626",
                          border: "1px solid #FECACA",
                          borderRadius: "8px",
                          px: "14px",
                          height: "30px",
                          minHeight: "30px",
                          "&:hover": {
                            borderColor: "#FCA5A5",
                            backgroundColor: "#FEF2F2",
                          },
                        }}
                      >
                        Remove
                      </Button>
                    </Box>
                  )}

                  <Box
                    sx={{
                      border: "2px dashed #D1D5DB",
                      borderRadius: "8px",
                      p: "20px",
                      textAlign: "center",
                      cursor: "pointer",
                      backgroundColor: "#F9FAFB",
                      "&:hover": {
                        backgroundColor: "#F3F4F6",
                      },
                    }}
                    onClick={() => stampInputRef.current?.click()}
                  >
                    <Typography sx={{ fontSize: 14, color: "#6B7280", mb: "8px" }}>
                      {companyData.stamp
                        ? "Click to upload a different stamp"
                        : "Click to upload or drag and drop"}
                    </Typography>
                    <Typography sx={{ fontSize: 12, color: "#9CA3AF" }}>
                      PNG, JPG or PDF (max. 5MB for images, 10MB for PDF)
                    </Typography>
                    <input
                      ref={stampInputRef}
                      type="file"
                      accept="application/pdf,image/*"
                      hidden
                      onChange={handleStampFileChange}
                    />
                  </Box>
                </Box>
              ) : (
                <Box>
                  {companyData.stamp ? (
                    <UploadedPreview
                      value={companyData.stamp}
                      label="Stamp"
                      onOpen={() => openDocumentPreview(companyData.stamp)}
                    />
                  ) : (
                    <Typography sx={{ fontSize: 14, color: "#808080" }}>-</Typography>
                  )}
                </Box>
              )}
            </Box>

            {/* SIGNATURE SECTION */}
            <Box
              sx={{
                border: "1px solid #E5E7EB",
                borderRadius: "8px",
                p: "20px",
                mt: "16px",
              }}
            >
              {/* HEADER */}
              <Box
                sx={{
                  display: "flex",
                  justifyContent: "space-between",
                  mb: "24px",
                }}
              >
                <Typography
                  sx={{
                    fontSize: "14px",
                    fontWeight: 600,
                    color: "#141414",
                  }}
                >
                  Signature
                </Typography>

                {!isEditingHeader && !isEditingCompanyDetails && !isEditingAddress && !isEditingContact && !isEditingTemplate && !isEditingStamp && !isEditingSignature ? (
                  <Button
                    startIcon={<EditStrokeIcon color={editSignatureHover ? '#1D4ED8' : '#6B7280'} />}
                    onClick={handleEditSignature}
                    onMouseEnter={() => setEditSignatureHover(true)}
                    onMouseLeave={() => setEditSignatureHover(false)}
                    onMouseDown={(e) => e.currentTarget.blur()}
                    onMouseUp={() => setEditSignatureHover(false)}
                    onBlur={() => setEditSignatureHover(false)}
                    sx={{
                      border: `1px solid ${editSignatureHover ? '#93C5FD' : '#D1D5DB'}`,
                      color: editSignatureHover ? "#1D4ED8" : "#6B7280",
                      backgroundColor: editSignatureHover ? "#EFF6FF" : "#FFFFFF",
                      borderRadius: "8px",
                      textTransform: "none",
                      px: "16px",
                      height: "32px",
                      minHeight: "32px",
                      transition: "all 0.2s ease",
                      outline: "none",
                      boxShadow: "none",
                    }}
                  >
                    Edit
                  </Button>
                ) : isEditingSignature ? (
                  <Box sx={{ display: "flex", gap: "12px" }}>
                    <Button
                      onClick={handleCancel}
                      disabled={isSaving}
                      sx={{
                        textTransform: "none",
                        color: "#1D4ED8",
                        // border: "1px solid #D1D5DB",
                        borderRadius: "8px",
                        px: "20px",
                        height: "32px",
                        minHeight: "32px",
                      }}
                    >
                      Cancel
                    </Button>

                    <Button
                      onClick={handleSave}
                      disabled={isSaving}
                      variant="contained"
                      sx={{
                        textTransform: "none",
                        backgroundColor: "#1D4ED8",
                        borderRadius: "8px",
                        px: "20px",
                        height: "32px",
                        minHeight: "32px",
                      }}
                    >
                      {isSaving ? <CircularProgress size={20} color="inherit" /> : "Save"}
                    </Button>
                  </Box>
                ) : null}
              </Box>

              {/* CONTENT */}
              {isEditingSignature ? (
                <Box>
                  {companyData.signature && (
                    <Box
                      sx={{
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "space-between",
                        gap: "12px",
                        p: "12px",
                        mb: "12px",
                        backgroundColor: "#F9FAFB",
                        borderRadius: "8px",
                        border: "1px solid #E5E7EB",
                      }}
                    >
                      <UploadedPreview
                        value={companyData.signature}
                        label="Signature"
                        onOpen={() => openDocumentPreview(companyData.signature)}
                      />

                      <Button
                        onClick={handleRemoveSignature}
                        disabled={isSaving}
                        sx={{
                          textTransform: "none",
                          color: "#DC2626",
                          border: "1px solid #FECACA",
                          borderRadius: "8px",
                          px: "14px",
                          height: "30px",
                          minHeight: "30px",
                          "&:hover": {
                            borderColor: "#FCA5A5",
                            backgroundColor: "#FEF2F2",
                          },
                        }}
                      >
                        Remove
                      </Button>
                    </Box>
                  )}

                  <Box
                    sx={{
                      border: "2px dashed #D1D5DB",
                      borderRadius: "8px",
                      p: "20px",
                      textAlign: "center",
                      cursor: "pointer",
                      backgroundColor: "#F9FAFB",
                      "&:hover": {
                        backgroundColor: "#F3F4F6",
                      },
                    }}
                    onClick={() => signatureInputRef.current?.click()}
                  >
                    <Typography sx={{ fontSize: 14, color: "#6B7280", mb: "8px" }}>
                      {companyData.signature
                        ? "Click to upload a different signature"
                        : "Click to upload or drag and drop"}
                    </Typography>
                    <Typography sx={{ fontSize: 12, color: "#9CA3AF" }}>
                      PNG, JPG, PDF (Image Max 5MB, PDF Max 10MB)
                    </Typography>
                    <input
                      ref={signatureInputRef}
                      type="file"
                      accept=".png,.jpg,.jpeg,.pdf"
                      hidden
                      onChange={handleSignatureFileChange}
                    />
                  </Box>
                </Box>
              ) : (
                <Box>
                  {companyData.signature ? (
                    <UploadedPreview
                      value={companyData.signature}
                      label="Signature"
                      onOpen={() => openDocumentPreview(companyData.signature)}
                    />
                  ) : (
                    <Typography sx={{ fontSize: 14, color: "#808080" }}>-</Typography>
                  )}
                </Box>
              )}
            </Box>
          </Box>
        )}
      </Box>
    </Box>
  );
}

export default CompanyProfile;
