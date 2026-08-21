import { Box } from "@mui/material";
import { useState, useCallback } from "react";
import { Outlet, useLocation } from "react-router-dom";

import Sidebar from "../components/sidebar/Sidebar";
import Topbar from "../components/topbar/Topbar";
import AddNewDialog from "../components/addNew/AddNewDialog";
import FloatingChatButton from "../components/chaticon/FloatingChatButton";
import LegalReconsentGate from "../components/legal/LegalReconsentGate";

function DashboardLayout() {
  const [addNewOpen, setAddNewOpen] = useState(false);
  const location = useLocation();
  const isChatPage = location.pathname === "/chat";
  const isCompanyProfilePage = location.pathname === "/company-profile";

  const handleAddNew = useCallback(() => {
    setAddNewOpen(true);
  }, []);

  const handleCloseAddNew = useCallback(() => {
    setAddNewOpen(false);
  }, []);

  return (
    <>
      <Box
        className="app-container"
        sx={{
          display: "flex",
          height: "100vh",
          minHeight: "100vh",
          width: "100%",
          backgroundColor: "var(--bg-canvas)",
        }}
      >
        {/* SIDEBAR - HIDDEN ON CHAT PAGE */}
        {!isChatPage && <Sidebar onAddNew={handleAddNew} />}

        {/* MAIN CONTENT AREA */}
        <Box
          sx={{
            flex: 1,
            display: "flex",
            flexDirection: "column",
            minWidth: 0, // IMPORTANT: prevents overflow bugs
          }}
        >
          {/* TOPBAR */}
          <Topbar onAddNew={handleAddNew} />

          {/* ROUTED PAGE CONTENT */}
          <Box
            className="main-content"
            sx={{
              flex: isCompanyProfilePage ? 1 : 1,
              scrollbarGutter: "stable",
              ...(isCompanyProfilePage
                ? {
                    display: "block",
                    overflow: "auto",
                    width: "100%",
                  }
                : {}),
              ...(isChatPage
                ? {
                    display: "flex",
                    // minHeight: 0 - without it, this flex item (inside the
                    // parent flex column with Topbar) defaults to
                    // min-height: auto and can grow to fit its content
                    // instead of being clamped to the remaining viewport
                    // height, which is what let Chat's own height: 100%
                    // panels miscompute and render a sent message's bubble
                    // up near the Topbar instead of inside the scrollable
                    // thread - reproduced live (bubble present in the DOM,
                    // positioned overlapping the Topbar).
                    minHeight: 0,
                    overflow: "hidden",
                    padding: "24px 40px",
                    gap: "24px",
                    backgroundColor: "var(--bg-canvas)",
                  }
                : {
                    // Same flexbox gotcha documented above for isChatPage:
                    // this Box is a flex item inside a fixed-height
                    // (100vh) column, so with no `overflow` set it uses
                    // min-height:auto and grows to fit its content instead
                    // of clamping to the remaining viewport height -  any
                    // page whose content is taller than one screen (e.g.
                    // Finance's stat cards + chart + companies + money
                    // made) then silently overflows past the outer
                    // 100vh container with no scrollbar anywhere,
                    // hard-clipped at the browser window's edge. Setting
                    // `overflow: auto` here gets the item the flexbox-spec
                    // "automatic minimum size -> 0" treatment (any value
                    // other than visible does this, per the flexbox spec -
                    // same reason isCompanyProfilePage's plain
                    // overflow:"auto" above needs no separate minHeight:0),
                    // so it clamps to the available space and scrolls
                    // internally instead. Pages that already fit one
                    // screen are unaffected - this scrollbar only appears
                    // when content actually overflows.
                    overflow: "auto",
                    backgroundColor: "transparent",
                  }),
            }}
          >
            <Outlet />
          </Box>
        </Box>

        {/* ADD NEW DIALOG */}
        <AddNewDialog
          open={addNewOpen}
          onClose={handleCloseAddNew}
        />
      </Box>

      {/* FLOATING CHAT BUTTON (GLOBAL) - HIDDEN ON CHAT PAGE */}
      {!isChatPage && <FloatingChatButton />}

      {/* MANDATORY RE-CONSENT GATE (GLOBAL) - renders nothing unless the
          signed-in user's accepted legal bundle version is out of date */}
      <LegalReconsentGate />
    </>
  );
}

export default DashboardLayout;

