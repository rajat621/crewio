import React, { useEffect, useState, useRef } from 'react';
import { Box, Paper, Typography, List, ListItem, ListItemText } from '@mui/material';
import { initSocket, subscribe, unsubscribe } from '../services/socket';

// Lazy-load react-leaflet to avoid breaking build when dep missing in some setups.
const MapWrapper = ({ points }) => {
  const [LeafletLoaded, setLeafletLoaded] = useState(false);
  const MapRef = useRef(null);

  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        const L = await import('leaflet');
        const { MapContainer, TileLayer, Marker, Popup } = await import('react-leaflet');
        if (!mounted) return;
        MapRef.current = { L, MapContainer, TileLayer, Marker, Popup };
        setLeafletLoaded(true);
      } catch (e) {
        console.warn('Leaflet not available:', e && e.message);
      }
    })();
    return () => { mounted = false; };
  }, []);

  if (!LeafletLoaded || !MapRef.current) {
    return <Box p={2}><Typography variant="body2">Map not available (missing leaflet). Install optional deps to enable.</Typography></Box>;
  }

  const { MapContainer, TileLayer, Marker, Popup } = MapRef.current;
  const center = points.length ? [points[points.length - 1].lat, points[points.length - 1].lng] : [25.2048, 55.2708];

  return (
    <MapContainer center={center} zoom={13} style={{ height: 400, width: '100%' }}>
      <TileLayer url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />
      {points.map((p, idx) => (
        <Marker key={idx} position={[p.lat, p.lng]}>
          <Popup>
            <div>
              <div><strong>{p.employeeId}</strong></div>
              <div>{new Date(p.timestamp).toLocaleString()}</div>
            </div>
          </Popup>
        </Marker>
      ))}
    </MapContainer>
  );
};

const Live = () => {
  const [events, setEvents] = useState([]);
  const [points, setPoints] = useState([]);

  useEffect(() => {
    initSocket();

    const onLocation = (payload) => {
      setEvents((s) => [{ type: 'location', payload, time: Date.now() }, ...s].slice(0, 100));
      setPoints((s) => [...s, { lat: payload.lat, lng: payload.lng, employeeId: payload.employeeId, timestamp: payload.timestamp }].slice(-200));
    };

    const onLifecycle = (payload) => {
      setEvents((s) => [{ type: 'lifecycle', payload, time: Date.now() }, ...s].slice(0, 100));
    };

    subscribe('employee.location_update', onLocation);
    subscribe('employee.check_in', onLifecycle);
    subscribe('employee.start_work', onLifecycle);
    subscribe('employee.stop_work', onLifecycle);
    subscribe('employee.leave_start', onLifecycle);
    subscribe('employee.leave_end', onLifecycle);
    subscribe('employee.site_finished', onLifecycle);

    return () => {
      unsubscribe('employee.location_update', onLocation);
      unsubscribe('employee.check_in', onLifecycle);
      unsubscribe('employee.start_work', onLifecycle);
      unsubscribe('employee.stop_work', onLifecycle);
      unsubscribe('employee.leave_start', onLifecycle);
      unsubscribe('employee.leave_end', onLifecycle);
      unsubscribe('employee.site_finished', onLifecycle);
    };
  }, []);

  return (
    <Box p={2} display="flex" gap={2} flexDirection={{ xs: 'column', md: 'row' }}>
      <Box flex="1">
        <Paper elevation={2} style={{ padding: 12 }}>
          <Typography variant="h6">Live Map</Typography>
          <MapWrapper points={points} />
        </Paper>
      </Box>
      <Box width={{ xs: '100%', md: 360 }}>
        <Paper elevation={2} style={{ padding: 12, maxHeight: 520, overflow: 'auto' }}>
          <Typography variant="h6">Recent Events</Typography>
          <List>
            {events.map((e, i) => (
              <ListItem key={i} divider>
                <ListItemText
                  primary={e.type}
                  secondary={JSON.stringify(e.payload).slice(0, 200)}
                />
              </ListItem>
            ))}
          </List>
        </Paper>
      </Box>
    </Box>
  );
};

export default Live;
