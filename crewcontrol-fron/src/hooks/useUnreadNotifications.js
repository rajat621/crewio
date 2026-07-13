import { useCallback, useEffect, useState } from "react";
import notificationsApi from "../api/notifications";
import { useSocket } from "../context/SocketContext";

const LIFECYCLE_EVENTS = [
  "employee:assigned",
  "employee:unassigned",
  "employee:checked_in",
  "employee:started_work",
  "employee:stopped_work",
  "employee:leave_started",
  "employee:leave_ended",
  "employee:site_finished",
];

/** Live unread-notification count for the topbar bell badge. */
function useUnreadNotifications() {
  const [count, setCount] = useState(0);
  const { socket } = useSocket();

  const refresh = useCallback(() => {
    notificationsApi
      .listOwnerNotifications()
      .then((res) => {
        const items = res?.data?.data || [];
        setCount(items.filter((n) => !n.read).length);
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  useEffect(() => {
    if (!socket) return;
    LIFECYCLE_EVENTS.forEach((event) => socket.on(event, refresh));
    return () => LIFECYCLE_EVENTS.forEach((event) => socket.off(event, refresh));
  }, [socket, refresh]);

  return { count, refresh };
}

export default useUnreadNotifications;
