import { Box, Button, TextField, Typography, Avatar, IconButton, Select, MenuItem, Alert, CircularProgress, InputAdornment } from "@mui/material";
import { useState, useRef } from "react";
import { useAuth } from "../context/AuthContext";
import ReactCountryFlag from "react-country-flag";
import EditIcon from "@mui/icons-material/Edit";
import AddAPhotoIcon from "@mui/icons-material/AddAPhoto";
import CalendarTodayOutlinedIcon from "@mui/icons-material/CalendarTodayOutlined";
import { authApi } from "../api/auth";
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

const formatDobInput = (value) => {
  const digits = value.replace(/\D/g, "").slice(0, 8);
  if (digits.length <= 2) return digits;
  if (digits.length <= 4) return `${digits.slice(0, 2)}-${digits.slice(2)}`;
  return `${digits.slice(0, 2)}-${digits.slice(2, 4)}-${digits.slice(4)}`;
};

function UserProfile() {
  const { user, updateUser } = useAuth();
  const fileInputRef = useRef(null);
  const dobPickerRef = useRef(null);

  // Edit modes - independent for each section
  const [isEditingCard, setIsEditingCard] = useState(false);
  const [isEditingInfo, setIsEditingInfo] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState(null);
  const [success, setSuccess] = useState(null);

  // Form data
  const [formData, setFormData] = useState({
    firstName: user?.firstName || "",
    lastName: user?.lastName || "",
    email: user?.email || "",
    dateOfBirth: user?.dateOfBirth || "",
    gender: user?.gender || "Male",
    mobileNumber: user?.mobileNumber || "",
    countryIso: normalizeCountryIso(user?.countryCode),
    countryCode: normalizeCountryCode(user?.countryCode),
    avatar: user?.avatar || null,
  });

  // Store original data for cancel functionality
  const [originalData, setOriginalData] = useState(formData);

  // Handle Edit Button 1 (Avatar + Name + Email)
  const handleEditCard = () => {
    setOriginalData(formData);
    setIsEditingCard(true);
  };

  // Handle Edit Button 2 (Personal Information)
  const handleEditInfo = () => {
    setOriginalData(formData);
    setIsEditingInfo(true);
  };

  // Handle Cancel
  const handleCancel = () => {
    setFormData(originalData);
    setIsEditingCard(false);
    setIsEditingInfo(false);
    setError(null);
  };

  // Handle input change
  const handleInputChange = (field, value) => {
    setFormData(prev => ({ ...prev, [field]: value }));
    setError(null);
  };

  const handleCountrySelectChange = (event) => {
    const selectedIso = event.target.value;
    const selectedCountry = COUNTRY_CODES.find((item) => item.isoCode === selectedIso);

    setFormData((prev) => ({
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

    setFormData((prev) => ({
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
      countryIso: formData.countryIso,
      countryCode: formData.countryCode,
    });
    handleInputChange("mobileNumber", nextMobile);
  };

  const handleDobTextChange = (event) => {
    handleInputChange("dateOfBirth", formatDobInput(event.target.value));
  };

  const handleDobCalendarChange = (event) => {
    const pickedDate = event.target.value;
    if (!pickedDate) {
      handleInputChange("dateOfBirth", "");
      return;
    }
    const [year, month, day] = pickedDate.split("-");
    handleInputChange("dateOfBirth", `${day}-${month}-${year}`);
  };

  const openDobPicker = () => {
    if (dobPickerRef.current?.showPicker) {
      dobPickerRef.current.showPicker();
      return;
    }
    dobPickerRef.current?.focus();
  };

  // Handle avatar file upload
  const handleAvatarClick = () => {
    fileInputRef.current?.click();
  };

  const handleFileChange = (event) => {
    const file = event.target.files?.[0];
    if (file) {
      // Validate file type
      if (!file.type.startsWith('image/')) {
        setError('Please select a valid image file');
        return;
      }

      // Validate file size (max 5MB)
      if (file.size > 5 * 1024 * 1024) {
        setError('Image size must be less than 5MB');
        return;
      }

      // Convert to base64
      const reader = new FileReader();
      reader.onload = (e) => {
        handleInputChange('avatar', e.target?.result);
      };
      reader.onerror = () => {
        setError('Failed to read image file');
      };
      reader.readAsDataURL(file);
    }
  };

  // Validate form data
  const validateFormData = (data) => {
    // If editing info (personal information section), validate those fields
    if (isEditingInfo) {
      if (!data.firstName?.trim()) {
        setError("First name is required");
        return false;
      }
      if (!data.lastName?.trim()) {
        setError("Last name is required");
        return false;
      }
      if (!data.email?.trim() || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(data.email)) {
        setError("Please enter a valid email address");
        return false;
      }
      if (data.mobileNumber && !/^\+?[\d\s\-()]+$/.test(data.mobileNumber)) {
        setError('Invalid phone number format');
        return false;
      }
    }
    // If editing card (avatar only), no additional validation needed
    return true;
  };

  // Handle Save
  const handleSave = async () => {
    if (!validateFormData(formData)) {
      return;
    }

    setIsLoading(true);
    setError(null);
    setSuccess(null);

    try {
      // Prepare data to send to API
      const updatePayload = {};

      // If editing card (avatar only)
      if (isEditingCard) {
        if (formData.avatar && formData.avatar !== user?.avatar) {
          updatePayload.avatar = formData.avatar;
        }
      }

      // If editing info (personal information)
      if (isEditingInfo) {
        updatePayload.firstName = formData.firstName.trim();
        updatePayload.lastName = formData.lastName.trim();
        updatePayload.email = formData.email.trim();
        updatePayload.dateOfBirth = formData.dateOfBirth;
        updatePayload.gender = formData.gender;
        updatePayload.mobileNumber = formData.mobileNumber;
        updatePayload.countryCode = formData.countryCode;
      }

      // Call API
      const response = await authApi.updateProfile(updatePayload);

      if (response.data?.user) {
        // Update user context
        updateUser(response.data.user);
        setSuccess('Profile updated successfully');
        setIsEditingCard(false);
        setIsEditingInfo(false);

        // Clear success message after 3 seconds
        setTimeout(() => setSuccess(null), 3000);
      }
    } catch (err) {
      console.error('Profile update error:', err);
      setError(err.response?.data?.message || err.message || 'Failed to update profile. Please try again.');
    } finally {
      setIsLoading(false);
    }
  };

  const selectedCountry =
    COUNTRY_CODES.find((item) => item.isoCode === formData.countryIso) || COUNTRY_CODES[1];

  const formattedDisplayMobile = (() => {
    const mobile = formData.mobileNumber?.trim();
    const code = formData.countryCode?.trim();

    if (!mobile) return "-";

    // If number already carries an international prefix, avoid prepending another code.
    if (mobile.startsWith("+")) {
      if (code && mobile.startsWith(code)) {
        const rest = mobile.slice(code.length).replace(/^[\s-]+/, "").trim();
        return rest ? `${code} ${rest}` : code;
      }
      return mobile;
    }

    return code ? `${code} ${mobile}` : mobile;
  })();

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
        backgroundColor: "var(--bg-surface)",
        border: "1px solid var(--border-input)",
        borderRadius: "10px",
        p: "24px",
      }}
    >
      {/* TITLE */}
      <Typography
        sx={{
          fontSize: "18px",
          fontWeight: 600,
          color: "var(--text-primary)",
          mb: 3,
        }}
      >
        My Profile
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

      {/* PROFILE HEADER CARD */}
      <Box
        sx={{
          border: "1px solid var(--border-input)",
          borderRadius: "8px",
          p: "20px",
          mb: "16px",
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
        }}
      >
        <Box sx={{ display: "flex", alignItems: "center", gap: "20px" }}>
          {/* AVATAR */}
          <Box sx={{ position: "relative" }}>
            <Avatar
              src={formData.avatar}
              sx={{
                width: 92,
                height: 92,
                bgcolor: "var(--border-input-hover)",
                fontSize: 30,
                cursor: isEditingCard ? "pointer" : "default",
              }}
              onClick={isEditingCard ? handleAvatarClick : undefined}
            >
              {!formData.avatar &&
                `${formData.firstName?.[0] || ""}${formData.lastName?.[0] || ""}`}
            </Avatar>

            {isEditingCard && (
              <IconButton
                onClick={handleAvatarClick}
                sx={{
                  position: "absolute",
                  bottom: 0,
                  right: 0,
                  backgroundColor: "var(--color-primary)",
                  color: "var(--bg-surface)",
                  width: 36,
                  height: 36,
                  "&:hover": { backgroundColor: "var(--color-primary-hover)" },
                }}
              >
                <AddAPhotoIcon sx={{ fontSize: 18 }} />
              </IconButton>
            )}

            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              hidden
              onChange={handleFileChange}
            />
          </Box>

          {/* NAME + EMAIL */}
          <Box>
            <Typography
              sx={{
                fontSize: "24px",
                fontWeight: 600,
                color: "var(--text-primary)",
              }}
            >
              {formData.firstName} {formData.lastName}
            </Typography>

            <Typography
              sx={{
                fontSize: "14px",
                color: "#5F5F6F",
                mt: "6px",
              }}
            >
              {formData.email}
            </Typography>
          </Box>
        </Box>

        {/* EDIT / SAVE / CANCEL */}
        {!isEditingCard && !isEditingInfo ? (
          <Button
            startIcon={<EditIcon />}
            onClick={handleEditCard}
            sx={{
              alignSelf: "flex-start",
              border: "1px solid var(--border-input-hover)",
              color: "var(--text-secondary)",
              borderRadius: "8px",
              textTransform: "none",
              px: "16px",
              height: "32px",
              minHeight: "32px",
              "& .MuiButton-startIcon svg": {
                fontSize: 14,
            },
            }}
          >
            Edit
          </Button>
        ) : isEditingCard ? (
          <Box sx={{ display: "flex", gap: "12px", alignSelf: "flex-start" }}>
            <Button
              onClick={handleCancel}
              disabled={isLoading}
              sx={{
                textTransform: "none",
                color: "var(--color-primary)",
                border: "1px solid var(--border-input-hover)",
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
              disabled={isLoading}
              variant="contained"
              sx={{
                textTransform: "none",
                backgroundColor: "var(--color-primary)",
                borderRadius: "8px",
                px: "20px",
                height: "32px",
                minHeight: "32px",
              }}
            >
              {isLoading ? (
                <CircularProgress size={20} color="inherit" />
              ) : (
                "Save"
              )}
            </Button>
          </Box>
        ) : null}
      </Box>

      {/* PERSONAL INFORMATION CARD */}
      <Box
        sx={{
          border: "1px solid var(--border-input)",
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
              color: "var(--text-primary)",
            }}
          >
            Personal Information
          </Typography>

          {!isEditingCard && !isEditingInfo ? (
            <Button
              startIcon={<EditIcon sx={{ fontSize: 14 }} />}
              onClick={handleEditInfo}
              sx={{
                border: "1px solid var(--border-input-hover)",
                color: "var(--text-secondary)",
                borderRadius: "8px",
                textTransform: "none",
                px: "16px",
                height: "32px",
                minHeight: "32px",
                "& .MuiButton-startIcon svg": {
                fontSize: 14,
            },
              }}
            >
              Edit
            </Button>
          ) : isEditingInfo ? (
            <Box sx={{ display: "flex", gap: "12px" }}>
              <Button
                onClick={handleCancel}
                disabled={isLoading}
                sx={{
                  textTransform: "none",
                  color: "var(--color-primary)",
                  border: "1px solid var(--border-input-hover)",
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
                disabled={isLoading}
                variant="contained"
                sx={{
                  textTransform: "none",
                  backgroundColor: "var(--color-primary)",
                  borderRadius: "8px",
                  px: "20px",
                  height: "32px",
                  minHeight: "32px",
                }}
              >
                {isLoading ? (
                  <CircularProgress size={20} color="inherit" />
                ) : (
                  "Save"
                )}
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
          {/* KEEP ALL YOUR EXISTING FIELDS EXACTLY SAME HERE */}

            <Box>
              <Typography
                sx={{
                  fontSize: 14,
                  color: "var(--text-secondary)",
                  fontFamily: "Inter",
                  mb: "8px",
                  fontWeight: 400,
                }}
              >
                First Name
              </Typography>
              {isEditingInfo ? (
                <TextField
                  fullWidth
                  value={formData.firstName}
                  onChange={(e) => handleInputChange("firstName", e.target.value)}
                  sx={{
                    "& .MuiOutlinedInput-root": {
                      height: "44px",
                      fontSize: 14,
                      fontFamily: "Inter",
                      backgroundColor: "var(--bg-surface)",
                      borderRadius: "8px",
                      border: "1px solid var(--border-card)",
                      color:"var(--text-primary)"
                    },
                  }}
                />
              ) : (
                <Typography sx={{ fontSize: 14, color: "var(--text-secondary)", fontFamily: "Inter" }}>
                  {formData.firstName}
                </Typography>
              )}
            </Box>

            {/* LAST NAME - READ ONLY IN INFO MODE */}
            <Box>
              <Typography
                sx={{
                  fontSize: 14,
                  color: "var(--text-secondary)",
                  fontFamily: "Inter",
                  mb: "8px",
                  fontWeight: 400,
                }}
              >
                Last Name
              </Typography>
              {isEditingInfo ? (
                <TextField
                  fullWidth
                  value={formData.lastName}
                  onChange={(e) => handleInputChange("lastName", e.target.value)}
                  sx={{
                    "& .MuiOutlinedInput-root": {
                      height: "44px",
                      fontSize: 14,
                      fontFamily: "Inter",
                      backgroundColor: "var(--bg-surface)",
                      borderRadius: "8px",
                      border: "1px solid var(--border-card)",
                      color:"var(--text-primary)"
                    },
                  }}
                />
              ) : (
                <Typography sx={{ fontSize: 14, color: "var(--text-secondary)", fontFamily: "Inter" }}>
                  {formData.lastName}
                </Typography>
              )}
            </Box>

            {/* DATE OF BIRTH */}
            <Box>
              <Typography
                sx={{
                  fontSize: 14,
                  color: "var(--text-secondary)",
                  fontFamily: "Inter",
                  mb: "8px",
                  fontWeight: 400,
                }}
              >
                Date of birth
              </Typography>
              {isEditingInfo ? (
                <>
                  <TextField
                    fullWidth
                    type="text"
                    value={formData.dateOfBirth}
                    onChange={handleDobTextChange}
                    placeholder="DD-MM-YYYY"
                    sx={{
                      "& .MuiOutlinedInput-root": {
                        height: "44px",
                        fontSize: 14,
                        fontFamily: "Inter",
                        backgroundColor: "var(--bg-surface)",
                        borderRadius: "8px",
                        border: "1px solid var(--border-card)",
                        color:"var(--text-primary)"
                        // pr: "12px",
                      },
                    }}
                    InputProps={{
                      endAdornment: (
                        <InputAdornment position="end" sx={{ pr: "12px" }}>
                          <IconButton onClick={openDobPicker} edge="end" sx={{ p: 0 }}>
                            <CalendarTodayOutlinedIcon sx={{ fontSize: 18, color: "var(--text-disabled)" }} />
                          </IconButton>
                        </InputAdornment>
                      ),
                    }}
                  />
                  <input
                    ref={dobPickerRef}
                    type="date"
                    onChange={handleDobCalendarChange}
                    style={{
                      position: "absolute",
                      opacity: 0,
                      pointerEvents: "none",
                      width: 0,
                      height: 0,
                    }}
                    tabIndex={-1}
                    aria-hidden="true"
                  />
                </>
              ) : (
                <Typography sx={{ fontSize: 14, color: "var(--text-secondary)", fontFamily: "Inter" }}>
                  {formData.dateOfBirth || "-"}
                </Typography>
              )}
            </Box>

            {/* GENDER */}
            <Box>
              <Typography
                sx={{
                  fontSize: 14,
                  color: "var(--text-secondary)",
                  fontFamily: "Inter",
                  mb: "8px",
                  fontWeight: 400,
                }}
              >
                Gender
              </Typography>
              {isEditingInfo ? (
                <Select
                  fullWidth
                  value={formData.gender}
                  onChange={(e) => handleInputChange("gender", e.target.value)}
                  sx={{
                    height: "44px",
                    fontSize: 14,
                    fontFamily: "Inter",
                    backgroundColor: "var(--bg-surface)",
                    borderRadius: "8px",
                    border: "1px solid var(--border-card)",
                    color:"var(--text-primary)",
                  }}
                >
                  <MenuItem value="Male">Male</MenuItem>
                  <MenuItem value="Female">Female</MenuItem>
                  <MenuItem value="Other">Other</MenuItem>
                </Select>
              ) : (
                <Typography sx={{ fontSize: 14, color: "var(--text-secondary)", fontFamily: "Inter" }}>
                  {formData.gender}
                </Typography>
              )}
            </Box>

            {/* EMAIL - READ ONLY IN INFO MODE */}
            <Box sx={{ gridColumn: "1 / -1" }}>
              <Typography
                sx={{
                  fontSize: 14,
                  color: "var(--text-secondary)",
                  fontFamily: "Inter",
                  mb: "8px",
                  fontWeight: 400,
                }}
              >
                Email
              </Typography>
              {isEditingInfo ? (
                <TextField
                  fullWidth
                  type="email"
                  value={formData.email}
                  onChange={(e) => handleInputChange("email", e.target.value)}
                  sx={{
                    "& .MuiOutlinedInput-root": {
                      height: "44px",
                      fontSize: 14,
                      fontFamily: "Inter",
                      backgroundColor: "var(--bg-surface)",
                      borderRadius: "8px",
                      border: "1px solid var(--border-card)",
                      color:"var(--text-primary)"
                    },
                  }}
                />
              ) : (
                <Typography sx={{ fontSize: 14, color: "var(--text-secondary)", fontFamily: "Inter" }}>
                  {formData.email}
                </Typography>
              )}
            </Box>

            {/* MOBILE NUMBER */}
            <Box sx={{ gridColumn: "1 / -1" }}>
              <Typography
                sx={{
                  fontSize: 14,
                  color: "var(--text-secondary)",
                  fontFamily: "Inter",
                  mb: "8px",
                  fontWeight: 400,
                }}
              >
                Mobile Number
              </Typography>
              {isEditingInfo ? (
                <Box
                  sx={{
                    display: "flex",
                    gap: 0,
                    alignItems: "stretch",
                    height: "44px",
                    border: "1px solid var(--border-input-hover)",
                    borderRadius: "12px",
                    backgroundColor: "var(--bg-surface)",
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
                      borderRight: "1px solid var(--border-input)",
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
                        value={formData.countryIso}
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
                      value={formData.countryCode}
                      onChange={handleCountryCodeChange}
                      placeholder="+1"
                      sx={{
                        width: "76px",
                        flex: "0 0 76px",
                        border: "none",
                        borderRight: "none",
                        padding: "0 8px 0 4px",
                        fontSize: 14,
                        color: "var(--text-primary)",
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
                    value={formData.mobileNumber}
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
                      color: "var(--text-primary)",
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
                  <Typography sx={{ fontSize: 14, color: "var(--text-secondary)", fontFamily: "Inter" }}>
                    {formattedDisplayMobile}
                  </Typography>
                </Box>
              )}
            </Box>
          {/* Paste your existing form fields block here exactly same */}
          {/* from FIRST NAME till MOBILE NUMBER */}



        </Box>
      </Box>
    </Box>
  </Box>
);

}

export default UserProfile;

