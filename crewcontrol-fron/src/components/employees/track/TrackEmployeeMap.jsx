
import { useEffect, useState } from "react";
import { Box, Button, CircularProgress, Typography } from "@mui/material";
import LocationOffIcon from "@mui/icons-material/LocationOff";
import RefreshIcon from "@mui/icons-material/Refresh";

const MAP_WRAPPER_SX = {
  height: "100%",
  borderRadius: 1,
  border: "1px solid",
  borderColor: "divider",
  overflow: "hidden",
};

const MapMessage = ({ children }) => (
  <Box
    sx={{
      ...MAP_WRAPPER_SX,
      display: "flex",
      flexDirection: "column",
      alignItems: "center",
      justifyContent: "center",
      gap: 1,
      bgcolor: "var(--bg-subtle, #f5f5f7)",
      px: 3,
      textAlign: "center",
    }}
  >
    {children}
  </Box>
);

const buildEmbedSrc = ({ lat, lng }) =>
  `https://maps.google.com/maps?q=${lat},${lng}&z=15&ie=UTF8&iwloc=&output=embed`;

/**
 * Shows either:
 *  - the selected employee's most recently reported GPS location, or
 *  - (nothing selected) the admin's own current device location, obtained
 *    live via the browser Geolocation API - never a hardcoded city.
 */
function TrackEmployeeMap({ selectedEmployee, location, locationStatus, onRefresh, requestError }) {
  const [deviceLocation, setDeviceLocation] = useState(null);
  const [deviceLocationStatus, setDeviceLocationStatus] = useState("loading"); // loading | ready | denied | unsupported | error

  useEffect(() => {
    // Only need the admin's own device location when no employee is picked.
    if (selectedEmployee) return;
    if (deviceLocation) return; // already have it, no need to re-request

    if (!("geolocation" in navigator)) {
      setDeviceLocationStatus("unsupported");
      return;
    }

    setDeviceLocationStatus("loading");
    navigator.geolocation.getCurrentPosition(
      (position) => {
        setDeviceLocation({
          lat: position.coords.latitude,
          lng: position.coords.longitude,
        });
        setDeviceLocationStatus("ready");
      },
      (error) => {
        setDeviceLocationStatus(error.code === error.PERMISSION_DENIED ? "denied" : "error");
      },
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 60000 }
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedEmployee]);

  // ---- An employee is selected: show their reported location ----
  if (selectedEmployee) {
    if (locationStatus === "loading") {
      return (
        <MapMessage>
          <CircularProgress size={28} />
          <Typography fontSize={13} color="text.secondary">
            Loading {selectedEmployee.name}&apos;s location…
          </Typography>
        </MapMessage>
      );
    }

    if (locationStatus === "ready" && location) {
      return (
        <Box sx={MAP_WRAPPER_SX}>
          <iframe
            title={`${selectedEmployee.name} location`}
            src={buildEmbedSrc(location)}
            style={{ width: "100%", height: "100%", border: 0 }}
          />
        </Box>
      );
    }

    return (
      <MapMessage>
        <LocationOffIcon sx={{ color: "text.secondary" }} />
        <Typography fontSize={13} color="text.secondary">
          {requestError
            ? requestError
            : `No location has been reported yet for ${selectedEmployee.name}. A request has been sent to their device - this updates automatically once they respond.`}
        </Typography>
        {onRefresh && (
          <Button size="small" startIcon={<RefreshIcon />} onClick={onRefresh} sx={{ mt: 1 }}>
            Try again
          </Button>
        )}
      </MapMessage>
    );
  }

  // ---- No employee selected: show the admin's own current location ----
  if (deviceLocationStatus === "loading") {
    return (
      <MapMessage>
        <CircularProgress size={28} />
        <Typography fontSize={13} color="text.secondary">
          Getting your current location…
        </Typography>
      </MapMessage>
    );
  }

  if (deviceLocationStatus === "ready" && deviceLocation) {
    return (
      <Box sx={MAP_WRAPPER_SX}>
        <iframe
          title="Your current location"
          src={buildEmbedSrc(deviceLocation)}
          style={{ width: "100%", height: "100%", border: 0 }}
        />
      </Box>
    );
  }

  const message =
    deviceLocationStatus === "denied"
      ? "Location access was denied. Enable it in your browser to see your current area, or select an employee to view theirs."
      : deviceLocationStatus === "unsupported"
      ? "Your browser doesn't support location access. Select an employee to view their location."
      : "Couldn't determine your current location. Select an employee to view theirs.";

  return (
    <MapMessage>
      <LocationOffIcon sx={{ color: "text.secondary" }} />
      <Typography fontSize={13} color="text.secondary">
        {message}
      </Typography>
    </MapMessage>
  );
}

export default TrackEmployeeMap;
