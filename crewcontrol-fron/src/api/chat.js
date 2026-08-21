//crewcontrol-fron/src/api/chat.js
import api from './client'
import { getApiBaseUrl } from './client'

export const chatApi = {

    getConversations: () =>
        api.get('/api/chat/conversations'),

    getEmployeesForChat: (params) =>
        api.get('/api/employees', { params }),

    getMessages: (employeeId) =>
        api.get(`/api/chat/employee/${employeeId}`),

    sendMessage: (employeeId, text) =>
        api.post('/api/chat/send', {
            toEmployeeId: employeeId,
            text,
        }),

    // Voice notes: multipart upload, audio/m4a or audio/aac only (matches
    // the backend's chat.controller.js VOICE_ALLOWED_MIME_TYPES). `duration`
    // is in whole seconds, same as the mobile app's recorder reports it.
    sendVoiceMessage: (employeeId, blob, durationSeconds) => {
        const formData = new FormData()
        formData.append('toEmployeeId', employeeId)
        formData.append('duration', String(Math.round(durationSeconds)))
        formData.append('file', blob, 'voice-note.webm')
        return api.post('/api/chat/send-voice', formData)
    },

    // Voice playback needs an absolute, token-bearing URL since it's used
    // directly as an <audio> src rather than going through the axios
    // instance (which would attach the header, not the query param the
    // backend's authenticateDualOrQueryToken route accepts).
    getVoiceUrl: (voiceUrlPath) => {
        const token = localStorage.getItem('crewcontrol_token')
        return `${getApiBaseUrl()}${voiceUrlPath}?token=${encodeURIComponent(token || '')}`
    },

    markRead: (employeeId) =>
        api.post(`/api/chat/read/${employeeId}`),
}
