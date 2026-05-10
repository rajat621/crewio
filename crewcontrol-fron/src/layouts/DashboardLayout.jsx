import { Box } from "@mui/material";
import { useState } from "react";
import { Outlet, useLocation } from "react-router-dom";

import Sidebar from "../components/sidebar/Sidebar";
import Topbar from "../components/topbar/Topbar";
import AddNewDialog from "../components/addNew/AddNewDialog";
import FloatingChatButton from "../components/chaticon/FloatingChatButton";

function DashboardLayout() {
  const [addNewOpen, setAddNewOpen] = useState(false);
  const location = useLocation();
  const isChatPage = location.pathname === "/chat";
  const isCompanyProfilePage = location.pathname === "/company-profile";

  const handleAddNew = () => {
    setAddNewOpen(true);
  };

  const handleCloseAddNew = () => {
    setAddNewOpen(false);
  };

  return (
    <>
      <Box
        className="app-container"
        sx={{
          display: "flex",
          height: "100vh",
          minHeight: "100vh",
          width: "100%",
          backgroundColor: "#F7F8FC",
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
                    padding: "24px 40px",
                    gap: "24px",
                    backgroundColor: "#F7F8FC",
                  }
                : {
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
    </>
  );
}

export default DashboardLayout;
