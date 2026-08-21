import { useState, memo } from "react";
import { Box, Dialog, Typography, Checkbox, Button, Alert } from "@mui/material";
import { useAuth } from "../../context/AuthContext";
import { legalApi, LEGAL_DOCUMENT_LINKS } from "../../api/legal";
import LegalDocumentModal from "./LegalDocumentModal";

/**
 * Mounted once at the dashboard shell (DashboardLayout). Blocks interaction
 * with the app whenever the signed-in user's accepted legal bundle version
 * doesn't match the current one - either because the documents changed
 * since they last accepted, or because they never explicitly accepted at
 * all (e.g. accounts created via Google sign-up, which bypasses the signup
 * form's checkbox).
 */
function LegalReconsentGate() {
  const { user, updateUser } = useAuth();
  const [checked, setChecked] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [openSlug, setOpenSlug] = useState(null);

  const mustReaccept = Boolean(user?.legalReacceptanceRequired);
  if (!mustReaccept) return null;

  const handleAccept = async () => {
    if (!checked) {
      setError("You must accept the legal agreements before creating your account.");
      return;
    }
    try {
      setSubmitting(true);
      setError("");
      await legalApi.accept();
      updateUser({ ...user, legalReacceptanceRequired: false });
    } catch (err) {
      setError(err?.response?.data?.message || "Failed to record your acceptance. Please try again.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <>
      <Dialog
        open
        disableEscapeKeyDown
        onClose={() => {}}
        maxWidth="sm"
        fullWidth
        PaperProps={{ sx: { borderRadius: "12px", padding: "8px" } }}
      >
        <Box sx={{ padding: "20px" }}>
          <Typography sx={{ fontSize: 18, fontWeight: 600, color: "var(--text-primary)", mb: "8px" }}>
            Our legal agreements have been updated
          </Typography>
          <Typography sx={{ fontSize: 14, color: "var(--text-secondary)", mb: "16px", lineHeight: "20px" }}>
            Please review and re-accept our legal agreements to continue using your account.
          </Typography>

          {error && (
            <Alert severity="error" sx={{ mb: "16px" }}>
              {error}
            </Alert>
          )}

          <Box sx={{ display: "flex", alignItems: "flex-start", gap: "8px", mb: "20px" }}>
            <Checkbox
              checked={checked}
              onChange={(e) => setChecked(e.target.checked)}
              sx={{ padding: 0, mt: "-2px" }}
            />
            <Typography sx={{ fontSize: 13, color: "var(--text-secondary)", lineHeight: "19px" }}>
              I have read and agree to the{" "}
              {LEGAL_DOCUMENT_LINKS.map((doc, idx) => (
                <span key={doc.slug}>
                  <Box
                    component="span"
                    onClick={() => setOpenSlug(doc.slug)}
                    sx={{ color: "var(--color-primary)", cursor: "pointer", "&:hover": { textDecoration: "underline" } }}
                  >
                    {doc.title}
                  </Box>
                  {idx < LEGAL_DOCUMENT_LINKS.length - 1 ? ", " : "."}
                </span>
              ))}
            </Typography>
          </Box>

          <Button
            fullWidth
            variant="contained"
            disabled={submitting}
            onClick={handleAccept}
            sx={{ textTransform: "none", borderRadius: "8px", py: "10px", backgroundColor: "var(--color-primary)" }}
          >
            {submitting ? "Saving..." : "Accept & Continue"}
          </Button>
        </Box>
      </Dialog>

      <LegalDocumentModal slug={openSlug} open={Boolean(openSlug)} onClose={() => setOpenSlug(null)} />
    </>
  );
}

export default memo(LegalReconsentGate);
