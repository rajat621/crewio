import {
  Alert,
  Box,
  Button,
  CircularProgress,
  FormControlLabel,
  IconButton,
  InputAdornment,
  Switch,
  TextField,
  Typography,
} from "@mui/material";
import VisibilityOutlinedIcon from "@mui/icons-material/VisibilityOutlined";
import VisibilityOffOutlinedIcon from "@mui/icons-material/VisibilityOffOutlined";
import { useEffect, useMemo, useState } from "react";
import { authApi } from "../api/auth";

function AccountSecurity() {
  const [isLoading, setIsLoading] = useState(true);
  const [isSavingPassword, setIsSavingPassword] = useState(false);
  const [is2faBusy, setIs2faBusy] = useState(false);

  const [isPasswordEditing, setIsPasswordEditing] = useState(false);
  const [twoFactorEnabled, setTwoFactorEnabled] = useState(false);
  const [showTwoFactorSetup, setShowTwoFactorSetup] = useState(false);
  const [twoFactorSetup, setTwoFactorSetup] = useState({
    secret: "",
    qrCodeUrl: "",
    otpauthUrl: "",
  });

  const [twoFactorCode, setTwoFactorCode] = useState("");
  const [passwordForm, setPasswordForm] = useState({
    currentPassword: "",
    newPassword: "",
    confirmPassword: "",
  });

  const [passwordVisibility, setPasswordVisibility] = useState({
    currentPassword: false,
    newPassword: false,
    confirmPassword: false,
  });

  const [error, setError] = useState(null);
  const [success, setSuccess] = useState(null);

  const passwordFields = useMemo(
    () => [
      { key: "currentPassword", label: "Current Password*" },
      { key: "newPassword", label: "New Password*" },
      { key: "confirmPassword", label: "Confirm Password*" },
    ],
    []
  );

  useEffect(() => {
    const loadSecurityState = async () => {
      try {
        setIsLoading(true);
        setError(null);
        const response = await authApi.getMe();
        setTwoFactorEnabled(Boolean(response?.data?.user?.twoFactorEnabled));
      } catch (err) {
        setError(err.response?.data?.message || "Failed to load security settings");
      } finally {
        setIsLoading(false);
      }
    };

    loadSecurityState();
  }, []);

  const handlePasswordFieldChange = (field, value) => {
    setPasswordForm((prev) => ({ ...prev, [field]: value }));
    setError(null);
  };

  const togglePasswordVisibility = (field) => {
    setPasswordVisibility((prev) => ({
      ...prev,
      [field]: !prev[field],
    }));
  };

  const handlePasswordEditToggle = () => {
    setError(null);
    setSuccess(null);
    setIsPasswordEditing(true);
  };

  const handlePasswordCancel = () => {
    setIsPasswordEditing(false);
    setPasswordForm({ currentPassword: "", newPassword: "", confirmPassword: "" });
    setPasswordVisibility({
      currentPassword: false,
      newPassword: false,
      confirmPassword: false,
    });
    setError(null);
  };

  const handlePasswordChange = async () => {
    if (!passwordForm.currentPassword || !passwordForm.newPassword || !passwordForm.confirmPassword) {
      setError("All password fields are required");
      return;
    }
    if (passwordForm.newPassword.length < 8) {
      setError("New password must be at least 8 characters");
      return;
    }
    if (passwordForm.newPassword !== passwordForm.confirmPassword) {
      setError("New password and confirm password do not match");
      return;
    }

    try {
      setIsSavingPassword(true);
      setError(null);
      await authApi.changePassword(passwordForm);
      setSuccess("Password changed successfully");
      setIsPasswordEditing(false);
      setPasswordForm({ currentPassword: "", newPassword: "", confirmPassword: "" });
      setTimeout(() => setSuccess(null), 3000);
    } catch (err) {
      setError(err.response?.data?.message || "Failed to change password");
    } finally {
      setIsSavingPassword(false);
    }
  };

  const handleTwoFactorToggle = async (event) => {
    const checked = event.target.checked;

    if (checked) {
      try {
        setIs2faBusy(true);
        setError(null);
        const response = await authApi.setupTwoFactor();
        setTwoFactorSetup({
          secret: response?.data?.setup?.secret || "",
          qrCodeUrl: response?.data?.setup?.qrCodeUrl || "",
          otpauthUrl: response?.data?.setup?.otpauthUrl || "",
        });
        setShowTwoFactorSetup(true);
      } catch (err) {
        setTwoFactorEnabled(false);
        setError(err.response?.data?.message || "Failed to start 2FA setup");
      } finally {
        setIs2faBusy(false);
      }
      return;
    }

    try {
      setIs2faBusy(true);
      setError(null);
      await authApi.disableTwoFactor();
      setTwoFactorEnabled(false);
      setShowTwoFactorSetup(false);
      setTwoFactorCode("");
      setSuccess("Google Authenticator disabled successfully");
      setTimeout(() => setSuccess(null), 3000);
    } catch (err) {
      setTwoFactorEnabled(true);
      setError(err.response?.data?.message || "Failed to disable 2FA");
    } finally {
      setIs2faBusy(false);
    }
  };

  const handleVerifyTwoFactor = async () => {
    if (!/^\d{6}$/.test(twoFactorCode.trim())) {
      setError("Enter a valid 6-digit authenticator code");
      return;
    }

    try {
      setIs2faBusy(true);
      setError(null);
      await authApi.verifyTwoFactor(twoFactorCode.trim());
      setTwoFactorEnabled(true);
      setShowTwoFactorSetup(false);
      setTwoFactorCode("");
      setSuccess("Google Authenticator enabled successfully");
      setTimeout(() => setSuccess(null), 3000);
    } catch (err) {
      setError(err.response?.data?.message || "Invalid authenticator code");
    } finally {
      setIs2faBusy(false);
    }
  };

  const handleCancelTwoFactorSetup = () => {
    setShowTwoFactorSetup(false);
    setTwoFactorCode("");
    setTwoFactorEnabled(false);
    setError(null);
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
          backgroundColor: "var(--bg-surface)",
          border: "1px solid var(--border-input)",
          borderRadius: "10px",
          p: "24px",
        }}
      >
        <Typography
          sx={{
            fontSize: "18px",
            fontWeight: 600,
            color: "var(--text-primary)",
            mb: 3,
          }}
        >
          Account & Security
        </Typography>

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

        <Box
          sx={{
            border: "1px solid var(--border-input)",
            borderRadius: "8px",
            p: "20px",
          }}
        >
          <Typography
            sx={{
              fontSize: "14px",
              fontWeight: 600,
              color: "var(--text-primary)",
              mb: "18px",
            }}
          >
            Security Setting
          </Typography>

          <Box
            sx={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              mb: "16px",
            }}
          >
            <Box>
              <Typography sx={{ fontSize: "14px", color: "var(--text-primary)", fontWeight: 500 }}>
                Google Authenticator (2FA)
              </Typography>
              <Typography sx={{ fontSize: "14px", color: "var(--text-secondary)", mt: "6px" }}>
                Use the Authenticator to get verification codes for better security
              </Typography>
            </Box>

            <FormControlLabel
              sx={{ m: 0 }}
              control={
                <Switch
                  checked={twoFactorEnabled}
                  disabled={is2faBusy}
                  onChange={handleTwoFactorToggle}
                  sx={{
                    "& .MuiSwitch-switchBase.Mui-checked": {
                      color: "var(--color-primary)",
                    },
                    "& .MuiSwitch-switchBase.Mui-checked + .MuiSwitch-track": {
                      backgroundColor: "#C7D2FE",
                      opacity: 1,
                    },
                  }}
                />
              }
              label=""
            />
          </Box>

          {showTwoFactorSetup && (
            <Box
              sx={{
                border: "1px solid var(--border-input)",
                borderRadius: "8px",
                p: "16px",
                mb: "20px",
                backgroundColor: "var(--bg-surface)",
              }}
            >
              <Typography sx={{ fontSize: "14px", fontWeight: 600, color: "var(--text-primary)", mb: "10px" }}>
                Complete Google Authenticator Setup
              </Typography>

              {twoFactorSetup.qrCodeUrl ? (
                <Box
                  component="img"
                  src={twoFactorSetup.qrCodeUrl}
                  alt="Google Authenticator QR"
                  sx={{ width: 180, height: 180, borderRadius: "8px", border: "1px solid var(--border-input)", mb: "10px" }}
                />
              ) : null}

              <Typography sx={{ fontSize: "12px", color: "var(--text-secondary)", mb: "6px" }}>
                If QR scan fails, enter this key manually in app:
              </Typography>
              <Typography sx={{ fontSize: "13px", color: "#1F2937", fontWeight: 600, mb: "12px", wordBreak: "break-all" }}>
                {twoFactorSetup.secret}
              </Typography>

              <TextField
                fullWidth
                placeholder="Enter 6-digit code from authenticator"
                value={twoFactorCode}
                onChange={(e) => {
                  setTwoFactorCode(e.target.value.replace(/\D/g, "").slice(0, 6));
                  setError(null);
                }}
                sx={{
                  maxWidth: "420px",
                  mb: "12px",
                  "& .MuiOutlinedInput-root": {
                    height: "44px",
                    fontSize: 14,
                    backgroundColor: "var(--bg-surface)",
                    borderRadius: "8px",
                    border: "1px solid var(--border-card)",
                    color: "var(--text-primary)",
                  },
                }}
              />

              <Box sx={{ display: "flex", gap: "12px" }}>
                <Button
                  onClick={handleCancelTwoFactorSetup}
                  disabled={is2faBusy}
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
                  onClick={handleVerifyTwoFactor}
                  disabled={is2faBusy}
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
                  {is2faBusy ? <CircularProgress size={18} color="inherit" /> : "Verify"}
                </Button>
              </Box>
            </Box>
          )}

          <Box
            sx={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "flex-start",
              mb: isPasswordEditing ? "14px" : 0,
            }}
          >
            <Box>
              <Typography sx={{ fontSize: "14px", color: "var(--text-primary)", fontWeight: 500 }}>
                Password
              </Typography>
              <Typography sx={{ fontSize: "14px", color: "var(--text-secondary)", mt: "6px" }}>
                Set a unique password for better protection
              </Typography>
            </Box>

            {!isPasswordEditing ? (
              <Button
                onClick={handlePasswordEditToggle}
                sx={{
                  border: "1px solid #5B84FF",
                  color: "var(--color-primary)",
                  borderRadius: "10px",
                  textTransform: "none",
                  px: "18px",
                  height: "32px",
                  minHeight: "32px",
                  fontWeight: 600,
                }}
              >
                Set password
              </Button>
            ) : (
              <Box sx={{ display: "flex", gap: "12px" }}>
                <Button
                  onClick={handlePasswordCancel}
                  disabled={isSavingPassword}
                  sx={{
                    textTransform: "none",
                    color: "var(--color-primary)",
                    borderRadius: "8px",
                    px: "8px",
                    minWidth: "auto",
                  }}
                >
                  Cancel
                </Button>

                <Button
                  onClick={handlePasswordChange}
                  disabled={isSavingPassword}
                  variant="contained"
                  sx={{
                    textTransform: "none",
                    backgroundColor: "var(--color-primary)",
                    borderRadius: "10px",
                    px: "24px",
                    height: "32px",
                    minHeight: "32px",
                  }}
                >
                  {isSavingPassword ? <CircularProgress size={18} color="inherit" /> : "Change"}
                </Button>
              </Box>
            )}
          </Box>

          {isPasswordEditing && (
            <Box sx={{ maxWidth: "580px" }}>
              {passwordFields.map((field) => (
                <Box key={field.key} sx={{ mb: "14px" }}>
                  <Typography
                    sx={{
                      fontSize: 14,
                      color: "var(--text-primary)",
                      mb: "8px",
                      fontWeight: 500,
                    }}
                  >
                    {field.label}
                  </Typography>

                  <TextField
                    fullWidth
                    type={passwordVisibility[field.key] ? "text" : "password"}
                    value={passwordForm[field.key]}
                    placeholder="Enter your password"
                    onChange={(e) => handlePasswordFieldChange(field.key, e.target.value)}
                    sx={{
                      "& .MuiOutlinedInput-root": {
                        height: "44px",
                        fontSize: 14,
                        backgroundColor: "var(--bg-surface)",
                        borderRadius: "8px",
                        border: "1px solid var(--border-card)",
                        color: "var(--text-primary)",
                      },
                    }}
                    InputProps={{
                      endAdornment: (
                        <InputAdornment position="end" sx={{ mr: "8px" }}>
                          <IconButton
                            onClick={() => togglePasswordVisibility(field.key)}
                            edge="end"
                            sx={{ p: 0.5 }}
                          >
                            {passwordVisibility[field.key] ? (
                              <VisibilityOffOutlinedIcon sx={{ fontSize: 18, color: "var(--text-disabled)" }} />
                            ) : (
                              <VisibilityOutlinedIcon sx={{ fontSize: 18, color: "var(--text-disabled)" }} />
                            )}
                          </IconButton>
                        </InputAdornment>
                      ),
                    }}
                  />
                </Box>
              ))}
            </Box>
          )}
        </Box>
      </Box>
    </Box>
  );
}

export default AccountSecurity;

