
import { useEffect, useRef, useState } from "react";
import { Box } from "@mui/material";
import TrackEmployeeTable from "./TrackEmployeeTable";
import TrackEmployeeMap from "./TrackEmployeeMap";
import { employeesApi } from "../../../api/employees";
import { useSocket } from "../../../context/SocketContext";

function TrackEmployee({ rows = [] }) {
  const [selectedRow, setSelectedRow] = useState(null);
  const [location, setLocation] = useState(null); // { lat, lng } | null
  const [locationStatus, setLocationStatus] = useState("idle"); // idle | loading | ready | none | error
  const [requestError, setRequestError] = useState(null); // visible-in-UI diagnostic message
  const { socket } = useSocket();
  const selectedRowRef = useRef(null);
  selectedRowRef.current = selectedRow;

  // Fetch the selected employee's most recent reported GPS location (see
  // backend GET /api/owner/locations/latest), and - since a stopped/idle
  // employee's app may not have sent a location in a while - also actively
  // ask their device to report its current position right now (see POST
  // /api/owner/locations/request). This works regardless of the employee's
  // check-in/attendance status: the request goes straight to their phone
  // over Socket.IO and doesn't depend on them being checked in or working.
  useEffect(() => {
    if (!selectedRow) {
      setLocation(null);
      setLocationStatus("idle");
      setRequestError(null);
      return;
    }

    let cancelled = false;
    setLocationStatus("loading");
    setRequestError(null);

    employeesApi
      .getLatestLocation(selectedRow.apiId)
      .then((res) => {
        if (cancelled) return;
        const data = res?.data?.data;
        if (data && typeof data.lat === "number" && typeof data.lng === "number") {
          console.log("[track-employee] found existing location for", selectedRow.name, data);
          setLocation({ lat: data.lat, lng: data.lng });
          setLocationStatus("ready");
        } else {
          console.log("[track-employee] no existing location on file for", selectedRow.name);
          setLocation(null);
          setLocationStatus("none");
        }
      })
      .catch((err) => {
        console.error("[track-employee] getLatestLocation failed:", err?.response?.data || err.message);
        if (cancelled) return;
        setLocation(null);
        setLocationStatus("none");
      })
      .finally(() => {
        // Ask their device for a fresh fix regardless of whether we found a
        // stale one - the live `employee:location_update` listener below
        // will pick up the response and update the map automatically.
        console.log("[track-employee] sending on-demand location request for", selectedRow.name);
        employeesApi
          .requestCurrentLocation(selectedRow.apiId)
          .then(() => console.log("[track-employee] on-demand request accepted by server"))
          .catch((err) => {
            const message = err?.response?.data?.message || err.message || "Request failed";
            console.error("[track-employee] requestCurrentLocation failed:", message);
            setRequestError(`Could not reach ${selectedRow.name}'s device: ${message}`);
          });
      });

    return () => {
      cancelled = true;
    };
  }, [selectedRow]);

  // Live update: when the employee's device responds (to the on-demand
  // request above, or from its normal periodic/lifecycle pings), update
  // the map immediately without waiting for another poll.
  useEffect(() => {
    if (!socket) return;

    const handleLocationUpdate = (payload) => {
      console.log("[track-employee] employee:location_update received:", payload);
      const current = selectedRowRef.current;
      if (!current || String(payload?.employeeId) !== String(current.apiId)) return;
      if (typeof payload?.lat !== "number" || typeof payload?.lng !== "number") return;
      setLocation({ lat: payload.lat, lng: payload.lng });
      setLocationStatus("ready");
    };

    socket.on("employee:location_update", handleLocationUpdate);
    return () => socket.off("employee:location_update", handleLocationUpdate);
  }, [socket]);

  const handleSelectRow = (row) => {
    setSelectedRow((prev) => (prev?.id === row.id ? null : row));
  };

  const handleRefreshLocation = () => {
    if (!selectedRow) return;
    setLocationStatus("loading");
    employeesApi
      .getLatestLocation(selectedRow.apiId)
      .then((res) => {
        const data = res?.data?.data;
        if (data && typeof data.lat === "number" && typeof data.lng === "number") {
          setLocation({ lat: data.lat, lng: data.lng });
          setLocationStatus("ready");
        } else {
          setLocationStatus("none");
        }
      })
      .catch(() => setLocationStatus("none"));
    employeesApi.requestCurrentLocation(selectedRow.apiId).catch(() => {});
  };

  return (
    <Box
      sx={{
        bgcolor: "var(--bg-surface)",
        border: "1px solid",
        borderColor: "divider",
        borderRadius: 1.5,
        p: "20px",
      height: 505, // 🔒 total card height
      }}
    >
      <Box
        sx={{
          display: "grid",
          gridTemplateColumns: "420px 1fr",
          gap: "20px",
          height: 460, // ✅ ONLY height definition
          flex: 1,
        }}
      >
        <TrackEmployeeTable
          rows={rows}
          selectedId={selectedRow?.id ?? null}
          onSelectRow={handleSelectRow}
        />
        <TrackEmployeeMap
          selectedEmployee={selectedRow}
          location={location}
          locationStatus={locationStatus}
          onRefresh={handleRefreshLocation}
          requestError={requestError}
        />
      </Box>
    </Box>
  );
}

export default TrackEmployee;
