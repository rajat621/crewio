import { useEffect, useMemo, useRef, useState } from "react";
import {
  Box,
  Dialog,
  IconButton,
  Typography,
  CircularProgress,
  Button,
} from "@mui/material";
import CloseIcon from "@mui/icons-material/Close";
import PrintOutlinedIcon from "@mui/icons-material/PrintOutlined";
import { legalApi } from "../../api/legal";

/**
 * Generic legal-document viewer. Fetches a single document by slug from
 * /api/legal/documents/:slug and renders title, version metadata, a
 * clickable table of contents, and scrollable, print-friendly content.
 *
 * Used from both the Signup checkbox links and the Account & Security >
 * Legal & Privacy section, so document content only ever lives in one
 * place (backend config/legalDocuments.js).
 */
function LegalDocumentModal({ slug, open, onClose }) {
  const [doc, setDoc] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const contentRef = useRef(null);
  const sectionRefs = useRef({});

  useEffect(() => {
    if (!open || !slug) return;
    let active = true;

    const load = async () => {
      try {
        setLoading(true);
        setError("");
        const response = await legalApi.getDocument(slug);
        if (active) setDoc(response?.data?.data || null);
      } catch (err) {
        if (active) setError(err?.response?.data?.message || "Failed to load this document");
      } finally {
        if (active) setLoading(false);
      }
    };

    load();
    return () => {
      active = false;
    };
  }, [open, slug]);

  const toc = useMemo(() => (doc?.sections || []).map((s) => s.heading), [doc]);

  const scrollToSection = (heading) => {
    const node = sectionRefs.current[heading];
    if (node && contentRef.current) {
      contentRef.current.scrollTo({ top: node.offsetTop - 12, behavior: "smooth" });
    }
  };

  const handlePrint = () => {
    window.print();
  };

  return (
    <Dialog
      open={open}
      onClose={onClose}
      fullWidth
      maxWidth="md"
      // Print-only rules: hide everything except the printable document body
      // when the browser print dialog is triggered from inside this modal.
      PaperProps={{
        id: "legal-doc-print-root",
        sx: {
          borderRadius: "12px",
          maxHeight: "85vh",
          backgroundColor: "var(--bg-surface)",
          "@media print": {
            maxHeight: "none",
            boxShadow: "none",
          },
        },
      }}
    >
      <style>{`
        @media print {
          body * { visibility: hidden; }
          #legal-doc-print-root, #legal-doc-print-root * { visibility: visible; }
          #legal-doc-print-root { position: absolute; left: 0; top: 0; width: 100%; }
          #legal-doc-print-hide { display: none !important; }
        }
      `}</style>

      <Box
        id="legal-doc-print-hide"
        sx={{
          display: "flex",
          alignItems: "flex-start",
          justifyContent: "space-between",
          padding: "20px 24px 12px",
          borderBottom: "1px solid var(--border-card)",
        }}
      >
        <Box>
          <Typography sx={{ fontSize: 18, fontWeight: 600, color: "var(--text-primary)", fontFamily: "Inter" }}>
            {doc?.title || "Legal document"}
          </Typography>
          {doc && (
            <Typography sx={{ fontSize: 12, color: "var(--text-secondary)", mt: "4px" }}>
              Version {doc.version} &bull; Effective {doc.effectiveDate} &bull; Last updated {doc.lastUpdated}
            </Typography>
          )}
        </Box>
        <Box sx={{ display: "flex", alignItems: "center", gap: "4px" }}>
          <IconButton onClick={handlePrint} aria-label="Print document" size="small">
            <PrintOutlinedIcon sx={{ fontSize: 20, color: "var(--text-secondary)" }} />
          </IconButton>
          <IconButton onClick={onClose} aria-label="Close document" size="small">
            <CloseIcon sx={{ fontSize: 20, color: "var(--text-secondary)" }} />
          </IconButton>
        </Box>
      </Box>

      <Box sx={{ display: "flex", minHeight: 0, flex: 1 }}>
        {loading ? (
          <Box sx={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", py: 6 }}>
            <CircularProgress size={22} />
          </Box>
        ) : error ? (
          <Box sx={{ flex: 1, p: 4, color: "var(--color-error)", fontSize: 14 }}>{error}</Box>
        ) : doc ? (
          <>
            {/* TABLE OF CONTENTS - hidden on narrow/mobile viewports */}
            {toc.length > 1 && (
              <Box
                id="legal-doc-print-hide"
                sx={{
                  width: 220,
                  flexShrink: 0,
                  borderRight: "1px solid var(--border-card)",
                  padding: "16px",
                  overflowY: "auto",
                  display: { xs: "none", sm: "block" },
                }}
              >
                <Typography sx={{ fontSize: 11, fontWeight: 600, color: "var(--text-secondary)", mb: "8px", letterSpacing: "0.04em" }}>
                  TABLE OF CONTENTS
                </Typography>
                {toc.map((heading) => (
                  <Box
                    key={heading}
                    onClick={() => scrollToSection(heading)}
                    sx={{
                      fontSize: 13,
                      color: "var(--text-secondary)",
                      cursor: "pointer",
                      py: "6px",
                      borderRadius: "6px",
                      px: "8px",
                      "&:hover": { backgroundColor: "var(--bg-surface-secondary)", color: "var(--text-primary)" },
                    }}
                  >
                    {heading}
                  </Box>
                ))}
              </Box>
            )}

            {/* SCROLLABLE CONTENT */}
            <Box
              ref={contentRef}
              sx={{
                flex: 1,
                overflowY: "auto",
                padding: "20px 28px 32px",
                "&::-webkit-scrollbar": { width: "8px" },
                "&::-webkit-scrollbar-thumb": {
                  backgroundColor: "var(--scrollbar-thumb)",
                  borderRadius: "999px",
                },
              }}
            >
              {doc.sections.map((section) => (
                <Box
                  key={section.heading}
                  ref={(node) => {
                    sectionRefs.current[section.heading] = node;
                  }}
                  sx={{ mb: "24px" }}
                >
                  <Typography sx={{ fontSize: 15, fontWeight: 600, color: "var(--text-primary)", mb: "8px", fontFamily: "Inter" }}>
                    {section.heading}
                  </Typography>
                  {section.body.map((block, idx) =>
                    block.type === "ul" ? (
                      <Box component="ul" key={idx} sx={{ pl: "20px", m: "8px 0" }}>
                        {block.items.map((item, i) => (
                          <Typography
                            component="li"
                            key={i}
                            sx={{ fontSize: 13.5, color: "var(--text-secondary)", lineHeight: "22px", mb: "4px" }}
                          >
                            {item}
                          </Typography>
                        ))}
                      </Box>
                    ) : (
                      <Typography
                        key={idx}
                        sx={{ fontSize: 13.5, color: "var(--text-secondary)", lineHeight: "22px", mb: "10px" }}
                      >
                        {block.text}
                      </Typography>
                    )
                  )}
                </Box>
              ))}
            </Box>
          </>
        ) : null}
      </Box>

      <Box
        id="legal-doc-print-hide"
        sx={{
          display: "flex",
          justifyContent: "flex-end",
          padding: "12px 24px",
          borderTop: "1px solid var(--border-card)",
        }}
      >
        <Button onClick={onClose} sx={{ textTransform: "none", color: "var(--text-secondary)" }}>
          Close
        </Button>
      </Box>
    </Dialog>
  );
}

export default LegalDocumentModal;
