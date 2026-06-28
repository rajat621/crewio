//crewcontrol-fron/src/api/chat.js
import api from './client'

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
}
