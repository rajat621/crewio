import { Box, Typography, Popover, MenuItem, CircularProgress, LinearProgress } from "@mui/material";
import AccountCircleIcon from "@mui/icons-material/AccountCircle";
import ArrowBackIosOutlinedIcon from "@mui/icons-material/ArrowBackIosOutlined";
import MoreVertIcon from "@mui/icons-material/MoreVert";
import SendIcon from "@mui/icons-material/Send";
import MicIcon from "@mui/icons-material/Mic";
import StopIcon from "@mui/icons-material/Stop";
import PlayArrowIcon from "@mui/icons-material/PlayArrow";
import PauseIcon from "@mui/icons-material/Pause";
import DeleteOutlineIcon from "@mui/icons-material/DeleteOutline";
import AddIcon from "@mui/icons-material/Add";
import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../../context/AuthContext";
import { useSocket } from "../../context/SocketContext";
import { chatApi } from "../../api/chat";

// Voice notes are business chat only - hard ceiling matches the backend's
// VOICE_MAX_DURATION_SECONDS in chat.controller.js.
const MAX_VOICE_SECONDS = 300;

function formatTime(value) {
  if (!value) return "Now";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Now";
  return date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

function formatDuration(totalSeconds) {
  const seconds = Math.max(0, Math.round(totalSeconds || 0));
  const m = String(Math.floor(seconds / 60)).padStart(2, "0");
  const s = String(seconds % 60).padStart(2, "0");
  return `${m}:${s}`;
}

function normalizeMessage(message, currentUserIds = []) {
  const fromId = String(message?.from || "");
  const isMine = currentUserIds.some((id) => id && String(id) === fromId);
  return {
    id: String(message?._id || message?.id || `${fromId}-${message?.createdAt || Date.now()}`),
    sender: isMine ? "you" : "other",
    text: message?.text || "",
    messageType: message?.messageType || "text",
    voiceUrl: message?.voiceUrl || null,
    duration: message?.duration ?? null,
    timestamp: formatTime(message?.createdAt),
  };
}

function ChatDetail({ chat, onBack, onLocalMessage }) {
  const { user } = useAuth();
  const { socket } = useSocket();
  const navigate = useNavigate();
  const messagesEndRef = useRef(null);
  const messagesContainerRef = useRef(null);
  const [anchorEl, setAnchorEl] = useState(null);
  const [messages, setMessages] = useState([]);
  const [inputValue, setInputValue] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [voiceError, setVoiceError] = useState("");

  // --- Voice notes: recording -------------------------------------------
  const [isRecording, setIsRecording] = useState(false);
  const [recordingSeconds, setRecordingSeconds] = useState(0);
  const [isSendingVoice, setIsSendingVoice] = useState(false);
  const mediaRecorderRef = useRef(null);
  const recordedChunksRef = useRef([]);
  const mediaStreamRef = useRef(null);
  const recordingTimerRef = useRef(null);

  // --- Voice notes: playback ---------------------------------------------
  // A single shared <audio> element for the whole thread so starting one
  // voice bubble always stops whichever one was already playing.
  const audioRef = useRef(null);
  const [playingId, setPlayingId] = useState(null);
  const [playbackProgress, setPlaybackProgress] = useState({});

  const currentUserIds = useMemo(() => {
    const ids = [user?.id, user?._id, user?.userId, user?.employeeId, user?.ownerId].filter(Boolean);
    return Array.from(new Set(ids.map((id) => String(id))));
  }, [user]);

  const handleMenuOpen = (event) => {
    setAnchorEl(event.currentTarget);
  };

  const handleMenuClose = () => {
    setAnchorEl(null);
  };

  const handleViewProfile = () => {
    handleMenuClose();
    navigate(`/employees/${chat.id}`);
  };

  const handleDeleteChat = () => {
    handleMenuClose();
    onBack();
  };

  // Root cause of a real, reproduced bug: scrollIntoView() walks UP the
  // ancestor tree for ANY scrollable container to bring messagesEndRef
  // into view - and Chat.jsx's outer row Box (ChatList + ChatDetail side
  // by side) has overflow:"hidden", which qualifies as a valid (if
  // unintended) scroll container. Once the sidebar's unpaginated ~1000-
  // employee conversation list made that outer box's content taller than
  // its own bounds, scrollIntoView scrolled THAT box by ~158px instead of
  // the actual message list - shifting the entire Chat page (list AND
  // detail pane) up and out of view, hiding messages behind the header.
  // Setting scrollTop directly on the message list's own container never
  // touches any ancestor, so this can't happen again regardless of what
  // else on the page overflows.
  const scrollToBottom = () => {
    const el = messagesContainerRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  useEffect(() => {
    let active = true;

    const loadMessages = async () => {
      if (!chat?.id) {
        setMessages([]);
        setLoading(false);
        return;
      }

      try {
        setLoading(true);
        setError("");
        const response = await chatApi.getMessages(chat.id);
        const list = Array.isArray(response?.data?.data)
          ? response.data.data
          : Array.isArray(response?.data?.messages)
            ? response.data.messages
            : [];
        const normalized = [...list]
          .reverse()
          .map((message) => normalizeMessage(message, currentUserIds));
        if (active) setMessages(normalized);
      } catch (err) {
        if (active) {
          setError(err?.response?.data?.message || "Failed to load chat messages");
          setMessages([]);
        }
      } finally {
        if (active) setLoading(false);
      }
    };

    loadMessages();
    return () => {
      active = false;
    };
  }, [chat?.id, currentUserIds]);

  // Opening a conversation marks every unread message in it as read, clears
  // the unread badge, and lets other connected sessions know via the
  // chat:read socket event (handled in ChatList/FloatingChatButton).
  useEffect(() => {
    if (!chat?.id) return;
    chatApi.markRead(chat.id).catch(() => {
      // Non-fatal - the badge just won't clear until the next successful
      // markRead call (e.g. re-opening the thread).
    });
  }, [chat?.id]);

  // Live incoming messages for the open thread - appended instantly, no
  // refresh needed, and immediately marked read since the user is looking
  // at this conversation right now.
  useEffect(() => {
    if (!socket || !chat?.id) return undefined;

    const handleMessage = (payload) => {
      if (!payload) return;
      const from = String(payload.from || "");
      const to = String(payload.to || "");
      const threadId = String(chat.id);
      const belongsToThread = from === threadId || to === threadId;
      if (!belongsToThread) return;

      setMessages((prev) => {
        if (prev.some((m) => m.id === String(payload._id))) return prev;
        return [...prev, normalizeMessage(payload, currentUserIds)];
      });

      const isIncoming = currentUserIds.length > 0 && !currentUserIds.includes(from);
      if (isIncoming) {
        chatApi.markRead(chat.id).catch(() => {});
      }
    };

    socket.on("chat:message", handleMessage);
    return () => socket.off("chat:message", handleMessage);
  }, [socket, chat?.id, currentUserIds]);

  const handleSendMessage = async () => {
    const text = inputValue.trim();
    if (!text || !chat?.id) return;

    try {
      const response = await chatApi.sendMessage(chat.id, text);
      const saved = response?.data?.data || response?.data?.message || {};
      const rawCreatedAt = saved?.createdAt || new Date().toISOString();
      const nextMessage = normalizeMessage(
        {
          ...saved,
          from: user?.id || user?._id || user?.userId || user?.employeeId,
          text,
          createdAt: rawCreatedAt,
        },
        currentUserIds
      );
      setMessages((prev) => {
        // The socket echo for this exact message (see the chat:message
        // listener above) can arrive before this REST response resolves -
        // a real race, not a hypothetical one, since a server-pushed
        // socket event often beats a full HTTP round-trip. Without this
        // check, both paths would append the same message: one send
        // action rendering it twice, with only one copy ever actually
        // written to the database (so a refresh - which reloads from the
        // database - shows the correct single copy).
        if (prev.some((m) => m.id === nextMessage.id)) return prev;
        return [...prev, nextMessage];
      });
      setInputValue("");
      // Phase 3.11: reports the sent message so ChatList can update its
      // own conversation preview independent of the socket - see the
      // comment on ChatList's localMessage effect for the full reasoning.
      // Uses rawCreatedAt (the actual ISO timestamp), not
      // nextMessage.createdAt - normalizeMessage's output has no raw
      // createdAt field, only a pre-formatted display `timestamp` string,
      // which would have silently broken applyConversationUpdate's
      // date parsing.
      onLocalMessage?.({
        from: user?.id || user?._id || user?.userId || user?.employeeId,
        to: chat.id,
        employeeName: chat.name,
        text,
        createdAt: rawCreatedAt,
      });
    } catch (err) {
      setError(err?.response?.data?.message || "Failed to send message");
    }
  };

  const handleKeyPress = (e) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSendMessage();
    }
  };

  // --- Voice notes: recording --------------------------------------------
  const pickSupportedMimeType = () => {
    const candidates = [
      "audio/webm;codecs=opus",
      "audio/webm",
      "audio/mp4",
      "audio/ogg;codecs=opus",
      "audio/ogg",
    ];
    if (typeof MediaRecorder === "undefined") return "";
    return candidates.find((type) => MediaRecorder.isTypeSupported?.(type)) || "";
  };

  const stopMediaStream = () => {
    mediaStreamRef.current?.getTracks().forEach((track) => track.stop());
    mediaStreamRef.current = null;
  };

  const startRecording = async () => {
    if (isRecording || !chat?.id) return;
    setVoiceError("");
    if (!navigator.mediaDevices?.getUserMedia) {
      setVoiceError("Voice notes aren't supported in this browser");
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      mediaStreamRef.current = stream;
      const mimeType = pickSupportedMimeType();
      const recorder = mimeType ? new MediaRecorder(stream, { mimeType }) : new MediaRecorder(stream);
      recordedChunksRef.current = [];

      recorder.ondataavailable = (event) => {
        if (event.data && event.data.size > 0) recordedChunksRef.current.push(event.data);
      };

      mediaRecorderRef.current = recorder;
      recorder.start();
      setIsRecording(true);
      setRecordingSeconds(0);
      recordingTimerRef.current = setInterval(() => {
        setRecordingSeconds((prev) => {
          const next = prev + 1;
          if (next >= MAX_VOICE_SECONDS) {
            stopRecording(true);
          }
          return next;
        });
      }, 1000);
    } catch (err) {
      setVoiceError("Microphone access was not granted");
    }
  };

  // Resolves once the recorder has flushed its final chunk, so callers can
  // reliably read recordedChunksRef right after awaiting this.
  const finalizeRecording = () =>
    new Promise((resolve) => {
      const recorder = mediaRecorderRef.current;
      if (!recorder || recorder.state === "inactive") {
        resolve();
        return;
      }
      recorder.onstop = () => resolve();
      recorder.stop();
    });

  const stopRecording = async (send) => {
    if (!isRecording) return;
    clearInterval(recordingTimerRef.current);
    recordingTimerRef.current = null;
    const durationSeconds = recordingSeconds;
    setIsRecording(false);

    await finalizeRecording();
    stopMediaStream();

    const chunks = recordedChunksRef.current;
    recordedChunksRef.current = [];

    if (!send || durationSeconds < 1 || chunks.length === 0 || !chat?.id) {
      return;
    }

    const mimeType = mediaRecorderRef.current?.mimeType || chunks[0]?.type || "audio/webm";
    const blob = new Blob(chunks, { type: mimeType });

    setIsSendingVoice(true);
    try {
      const response = await chatApi.sendVoiceMessage(chat.id, blob, durationSeconds);
      const saved = response?.data?.data || {};
      const rawCreatedAt = saved?.createdAt || new Date().toISOString();
      const nextMessage = normalizeMessage(
        {
          ...saved,
          from: user?.id || user?._id || user?.userId || user?.employeeId,
          createdAt: rawCreatedAt,
        },
        currentUserIds
      );
      setMessages((prev) => {
        // The socket echo for this exact message (see the chat:message
        // listener above) can arrive before this REST response resolves -
        // a real race, not a hypothetical one, since a server-pushed
        // socket event often beats a full HTTP round-trip. Without this
        // check, both paths would append the same message: one send
        // action rendering it twice, with only one copy ever actually
        // written to the database (so a refresh - which reloads from the
        // database - shows the correct single copy).
        if (prev.some((m) => m.id === nextMessage.id)) return prev;
        return [...prev, nextMessage];
      });
      // Phase 3.11: see the text-send handler above for the full
      // reasoning. messageType is hardcoded 'voice' here rather than
      // read from `saved` - this handler only ever runs for voice sends,
      // so it's certain regardless of the backend response's exact shape.
      onLocalMessage?.({
        from: user?.id || user?._id || user?.userId || user?.employeeId,
        to: chat.id,
        employeeName: chat.name,
        messageType: "voice",
        createdAt: rawCreatedAt,
      });
    } catch (err) {
      setVoiceError(err?.response?.data?.message || "Failed to send voice note");
    } finally {
      setIsSendingVoice(false);
    }
  };

  const cancelRecording = () => {
    clearInterval(recordingTimerRef.current);
    recordingTimerRef.current = null;
    setIsRecording(false);
    const recorder = mediaRecorderRef.current;
    if (recorder && recorder.state !== "inactive") recorder.stop();
    recordedChunksRef.current = [];
    stopMediaStream();
  };

  useEffect(() => {
    // Safety net: if the component unmounts mid-recording (chat closed,
    // navigated away), make sure the mic is released and nothing orphaned
    // keeps recording in the background.
    return () => {
      clearInterval(recordingTimerRef.current);
      stopMediaStream();
    };
  }, []);

  // --- Voice notes: playback ----------------------------------------------
  const togglePlayback = (message) => {
    if (!message.voiceUrl) return;
    const audio = audioRef.current;
    if (!audio) return;

    if (playingId === message.id) {
      if (audio.paused) {
        audio.play();
      } else {
        audio.pause();
      }
      return;
    }

    audio.pause();
    audio.src = chatApi.getVoiceUrl(message.voiceUrl);
    audio.currentTime = 0;
    setPlayingId(message.id);
    audio.play();
  };

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return undefined;

    const handleTimeUpdate = () => {
      if (!playingId) return;
      setPlaybackProgress((prev) => ({
        ...prev,
        [playingId]: audio.duration ? audio.currentTime / audio.duration : 0,
      }));
    };
    const handleEnded = () => setPlayingId(null);

    audio.addEventListener("timeupdate", handleTimeUpdate);
    audio.addEventListener("ended", handleEnded);
    return () => {
      audio.removeEventListener("timeupdate", handleTimeUpdate);
      audio.removeEventListener("ended", handleEnded);
    };
  }, [playingId]);

  return (
    <Box
      sx={{
        display: "flex",
        flexDirection: "column",
        flex: 1,
        backgroundColor: "var(--bg-surface-secondary)",
        height: "100%",
        borderLeft: "none",
        borderRight: "none",
      }}
    >
      {/* HEADER WITH BACK BUTTON, EMPLOYEE NAME, AND MENU */}
      <Box
        sx={{
          height: 64,
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          padding: "16px 32px",
          backgroundColor: "var(--bg-surface-secondary)",
          borderBottom: "1px solid var(--border-card)",
        }}
      >
        {/* BACK BUTTON WITH PROFILE AND NAME */}
        <Box
          sx={{
            display: "flex",
            alignItems: "center",
            gap: "4px",
            cursor: "pointer",
            height: 44,
            padding: "16px",
            paddingLeft: "12px",
          }}
          onClick={onBack}
        >
          {/* <Box
            sx={{
            display: "flex",
            justifyContent: "center",
            alignItems: "center",
            cursor: "pointer",
            height: 32,
            width: 32,
            paddingLeft: 0,
            backgroundColor:"transparent",
          }}
          >
          <ArrowBackIosOutlinedIcon sx={{ color: "var(--text-secondary)", fontSize: 14 }} />
          </Box> */}
          <AccountCircleIcon
            sx={{
              width: 32,
              height: 32,
              color: "var(--text-secondary)",
            }}
          >
          </AccountCircleIcon>

          <Typography
            sx={{
              fontSize: 14,
              fontFamily: "Inter",
              fontWeight: 500,
              color: "var(--text-primary)",
            }}
          >
            {chat.name}
          </Typography>
        </Box>

        {/* 3-DOT MENU */}
        <Box
          onClick={handleMenuOpen}
          sx={{
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            cursor: "pointer",
            padding: "8px",
            borderRadius: "8px",
            transition: "background-color 0.15s ease",
            "&:hover": {
              backgroundColor: "var(--bg-surface-secondary)",
            },
          }}
        >
          <MoreVertIcon sx={{ color: "var(--text-secondary)", fontSize: 24 }} />
        </Box>

        {/* MENU POPOVER */}
        <Popover
          open={Boolean(anchorEl)}
          anchorEl={anchorEl}
          onClose={handleMenuClose}
          anchorOrigin={{
            vertical: "bottom",
            horizontal: "right",
          }}
          transformOrigin={{
            vertical: "top",
            horizontal: "right",
          }}
          PaperProps={{
            sx: {
              boxShadow: "0px 0px 2px 0px rgba(80, 92, 95, 0.2), 0px 6px 10px 0px var(--shadow-overlay)",
              borderRadius: "8px",
              border: "1px solid var(--border-card)",
            },
          }}
        >
          <MenuItem
            onClick={handleViewProfile}
            sx={{
              fontSize: 14,
              fontFamily: "Inter",
              color: "var(--text-primary)",
              padding: "12px 20px",
              "&:hover": {
                backgroundColor: "var(--bg-surface-secondary)",
              },
            }}
          >
            View Profile
          </MenuItem>
          <MenuItem
            onClick={handleDeleteChat}
            sx={{
              fontSize: 14,
              fontFamily: "Inter",
              color: "var(--color-error)",
              padding: "12px 20px",
              "&:hover": {
                backgroundColor: "var(--bg-surface)5F5",
              },
            }}
          >
            Delete Chat
          </MenuItem>
        </Popover>
      </Box>

      {/* MESSAGES CONTAINER */}
      <Box
        ref={messagesContainerRef}
        sx={{
          flex: 1,
          overflowY: "auto",
          overflowX: "hidden",
          display: "flex",
          flexDirection: "column",
          paddingTop: "24px",
          paddingBottom: "24px",
          paddingLeft: "32px",
          paddingRight: "35px",
          gap: "12px",
          backgroundColor: "var(--bg-surface)",
          "&::-webkit-scrollbar": {
            width: "8px",
          },
          "&::-webkit-scrollbar-thumb": {
            backgroundColor: "var(--scrollbar-thumb)",
            borderRadius: "999px",
            "&:hover": {
              backgroundColor: "var(--scrollbar-thumb-hover)",
            },
          },
          "&::-webkit-scrollbar-track": {
            backgroundColor: "transparent",
          },
        }}
      >
        {loading ? (
          <Box sx={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center" }}>
            <CircularProgress size={24} />
          </Box>
        ) : error ? (
          <Box sx={{ p: 2, color: "var(--color-error)", fontSize: 14 }}>{error}</Box>
        ) : messages.length ? (
          messages.map((message) => (
            <Box
              key={message.id}
              sx={{
                display: "flex",
                justifyContent: message.sender === "you" ? "flex-end" : "flex-start",
              }}
            >
              <Box
                sx={{
                  maxWidth: "60%",
                  display: "flex",
                  flexDirection: "column",
                  gap: "4px",
                  backgroundColor: "transparent"
                }}
              >
                <Box
                  sx={{
                    backgroundColor: message.sender === "you" ? "var(--color-primary)" : "var(--bg-surface-tertiary)",
                    color: message.sender === "you" ? "var(--bg-surface)" : "var(--text-primary)",
                    padding: message.messageType === "voice" ? "8px 10px" : "8px 12px",
                    borderRadius: "8px",
                    fontSize: 14,
                    fontFamily: "Inter",
                    lineHeight: "20px",
                    wordWrap: "break-word",
                  }}
                >
                  {message.messageType === "voice" ? (
                    message.voiceUrl ? (
                      <Box sx={{ display: "flex", alignItems: "center", gap: "8px", width: 180 }}>
                        <Box
                          role="button"
                          tabIndex={0}
                          aria-label={playingId === message.id ? "Pause voice note" : "Play voice note"}
                          onClick={() => togglePlayback(message)}
                          sx={{ display: "flex", alignItems: "center", cursor: "pointer" }}
                        >
                          {playingId === message.id ? (
                            <PauseIcon sx={{ fontSize: 22 }} />
                          ) : (
                            <PlayArrowIcon sx={{ fontSize: 22 }} />
                          )}
                        </Box>
                        <LinearProgress
                          variant="determinate"
                          value={playingId === message.id ? (playbackProgress[message.id] || 0) * 100 : 0}
                          sx={{
                            flex: 1,
                            height: 3,
                            borderRadius: "999px",
                            backgroundColor:
                              message.sender === "you" ? "rgba(255,255,255,0.3)" : "var(--border-card)",
                            "& .MuiLinearProgress-bar": {
                              backgroundColor: message.sender === "you" ? "var(--bg-surface)" : "var(--color-primary)",
                            },
                          }}
                        />
                        <Typography sx={{ fontSize: 11, fontFamily: "Inter", flexShrink: 0 }}>
                          {formatDuration(message.duration)}
                        </Typography>
                      </Box>
                    ) : (
                      <Typography sx={{ fontSize: 13, fontStyle: "italic", opacity: 0.7 }}>
                        Voice note unavailable
                      </Typography>
                    )
                  ) : (
                    message.text
                  )}
                </Box>
                <Typography
                  sx={{
                    fontSize: 12,
                    color: "var(--text-placeholder)",
                    fontFamily: "Inter",
                    paddingX: "4px",
                    textAlign: message.sender === "you" ? "right" : "left",
                  }}
                >
                  {message.timestamp}
                </Typography>
              </Box>
            </Box>
          ))
        ) : (
          <Box sx={{ p: 2, color: "var(--text-secondary)", fontSize: 14 }}>No messages yet.</Box>
        )}
        <div ref={messagesEndRef} />
      </Box>

      {/* Shared audio element for voice-note playback - one at a time */}
      <audio ref={audioRef} style={{ display: "none" }} />

      {voiceError ? (
        <Box
          sx={{
            paddingX: "32px",
            paddingBottom: "4px",
            fontSize: 12,
            color: "var(--color-error)",
            fontFamily: "Inter",
          }}
        >
          {voiceError}
        </Box>
      ) : null}

      {/* MESSAGE INPUT BOX - STICKY AT BOTTOM */}
      <Box
        sx={{
          display: "flex",
          alignItems: "center",
          paddingLeft: "32px",
          paddingRight: "32px",
          paddingTop: 0,
          paddingBottom: "16px",
          height: 52,
          backgroundColor: "var(--bg-surface)",
          position: "sticky",
          bottom: 0,
        }}
      >
        {isRecording ? (
          /* RECORDING IN PROGRESS - replaces the text input entirely while active */
          <Box
            sx={{
              display: "flex",
              alignItems: "center",
              width: "100%",
              height: 52,
              backgroundColor: "var(--bg-surface-secondary)",
              border: "1px solid var(--border-card)",
              borderRadius: "8px",
              paddingX: "12px",
              gap: "12px",
            }}
          >
            <Box
              sx={{
                width: 8,
                height: 8,
                borderRadius: "50%",
                backgroundColor: "var(--color-error)",
                flexShrink: 0,
              }}
            />
            <Typography sx={{ fontSize: 14, fontFamily: "Inter", color: "var(--text-primary)" }}>
              {formatDuration(recordingSeconds)}
            </Typography>
            <Box sx={{ flex: 1 }} />
            <Box
              role="button"
              tabIndex={0}
              aria-label="Cancel recording"
              onClick={cancelRecording}
              sx={{
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                cursor: "pointer",
                color: "var(--text-secondary)",
                padding: "4px",
              }}
            >
              <DeleteOutlineIcon sx={{ fontSize: 20 }} />
            </Box>
            <Box
              role="button"
              tabIndex={0}
              aria-label="Stop and send voice note"
              onClick={() => stopRecording(true)}
              sx={{
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                cursor: "pointer",
                color: "var(--color-primary)",
                padding: "4px",
              }}
            >
              <StopIcon sx={{ fontSize: 22 }} />
            </Box>
          </Box>
        ) : (
        /* INPUT FIELD WITH ICONS INSIDE */
        <Box
          sx={{
            display: "flex",
            alignItems: "center",
            width: "100%",
            height: 52,
            backgroundColor: "var(--bg-surface-secondary)",
            border: "1px solid var(--border-card)",
            borderRadius: "8px",
            paddingX: "12px",
            gap: "8px",
            transition: "border-color 0.15s ease",
            "&:focus-within": {
              borderColor: "var(--color-primary)",
            },
            "&:hover": {
              borderColor: "var(--bg-surface-tertiary)",
            },
          }}
        >
          {/* + ICON INSIDE */}
          <Box
            sx={{
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              cursor: "pointer",
              color: "var(--color-primary)",
              padding: "4px",
              borderRadius: "6px",
              transition: "background-color 0.15s ease",
              "&:hover": {
                backgroundColor: "var(--bg-surface-secondary)",
              },
            }}
          >
            <AddIcon sx={{ fontSize: 20 }} />
          </Box>

          {/* TEXT INPUT */}
          <input
            type="text"
            value={inputValue}
            onChange={(e) => setInputValue(e.target.value)}
            onKeyPress={handleKeyPress}
            placeholder="Type your message..."
            aria-label="Type your message"
            style={{
              flex: 1,
              border: "none",
              outline: "none",
              backgroundColor: "transparent",
            fontSize: 14,
            fontFamily: "Inter",
            color: "var(--text-primary)",
            height: "100%",
            padding: 0,
            margin: 0,
          }}
        />

          {/* MIC / SEND ICON INSIDE - DYNAMIC */}
          <Box
            role="button"
            tabIndex={0}
            aria-label={inputValue.trim() ? "Send message" : "Record voice message"}
            aria-busy={isSendingVoice}
            sx={{
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              cursor: isSendingVoice ? "default" : "pointer",
              color: "var(--color-primary)",
              padding: "4px",
              borderRadius: "6px",
              transition: "background-color 0.15s ease",
              "&:hover": {
                backgroundColor: "var(--bg-surface-secondary)",
              },
              "&:focus-visible": {
                outline: "2px solid var(--color-primary)",
                outlineOffset: "2px",
              },
            }}
            onClick={isSendingVoice ? undefined : inputValue.trim() ? handleSendMessage : startRecording}
            onKeyDown={(e) => {
              if (isSendingVoice) return;
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                if (inputValue.trim()) {
                  handleSendMessage();
                } else {
                  startRecording();
                }
              }
            }}
          >
            {isSendingVoice ? (
              <CircularProgress size={18} />
            ) : inputValue.trim() ? (
              <SendIcon sx={{ fontSize: 18 }} />
            ) : (
              <MicIcon sx={{ fontSize: 20 }} />
            )}
          </Box>
        </Box>
        )}
      </Box>
    </Box>
  );
}

export default ChatDetail;

