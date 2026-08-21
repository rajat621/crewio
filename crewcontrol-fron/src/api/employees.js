import api from './client'

export const employeesApi = {
  getEmployees: (params) =>
    api.get('/api/employees', { params }),

  // Tenant-wide counts (total/assignedStatus/passportStatus/
  // emirateIdStatus/status) computed server-side over the FULL employee
  // population - not the paginated list. Use this for any KPI/card that
  // needs a true total, never sum/filter the paginated getEmployees()
  // result for that purpose.
  getEmployeeStats: () =>
    api.get('/api/employees/stats'),

  // Employees -> Attendance tab: paginated employees already joined
  // server-side with their attendance for the selected+current month
  // (see employee.controller.js's getEmployeeAttendancePage).
  getEmployeeAttendancePage: (params) =>
    api.get('/api/employees/attendance-page', { params }),

  getEmployee: (id) =>
    api.get(`/api/employees/${id}`),
  
  createEmployee: (data) =>
    api.post('/api/employees', data),
  
  updateEmployee: (id, data) =>
    api.put(`/api/employees/${id}`, data),
  
  // deleteEmployee removed (dead code cleanup) - zero usage anywhere in
  // the frontend.

  // Employee documents (passport/Emirates ID/labour card/medical
  // certificate/residence ID/contract copies) - immediate multipart upload
  // to the existing generic /api/upload endpoint, scoped to its own
  // 'employee-documents' folder (5MB, PDF/JPG/JPEG/PNG only - see
  // backend/src/routes/upload.routes.js). Returns { success, fileName,
  // fileUrl, fileSize, mimeType }; only fileUrl needs to be stored on the
  // employee record.
  uploadDocument: (file, { onProgress } = {}) => {
    const formData = new FormData();
    formData.append('file', file);
    formData.append('folder', 'employee-documents');

    return api.post('/api/upload', formData, {
      headers: {
        'Content-Type': 'multipart/form-data',
      },
      onUploadProgress: onProgress
        ? (event) => {
            if (!event.total) return;
            onProgress(Math.round((event.loaded / event.total) * 100));
          }
        : undefined,
    });
  },
  
  assignEmployee: (id, companyId) =>
    api.post(`/api/employees/${id}/assign`, { companyId }),

  // Opens an uploaded employee document (fileUrl is a relative path like
  // /api/files/<id>, protected by GET /api/files/:id requiring a Bearer
  // token read directly off the request header). A plain window.open(url)
  // is a top-level navigation - browsers never attach custom headers to
  // one, only cookies, and this app authenticates with a Bearer token in
  // localStorage, not a cookie - so that always 401s (or shows a generic
  // 404 if a reverse proxy in front of the API doesn't even route the
  // request through). Fetching through `api` (which already attaches the
  // token via its request interceptor) and opening the bytes as a blob
  // URL is the only way this can actually work.
  previewDocument: async (fileUrl) => {
    if (!fileUrl) return;
    const response = await api.get(fileUrl, { responseType: 'blob' });
    const blobUrl = URL.createObjectURL(response.data);
    window.open(blobUrl, '_blank', 'noopener');
    // The new tab has its own copy of the bytes once it loads; give it a
    // few seconds before releasing this one rather than revoking
    // immediately, which can race the tab still loading it.
    setTimeout(() => URL.revokeObjectURL(blobUrl), 30000);
  },

  unassignEmployee: (id) =>
    api.post(`/api/employees/${id}/unassign`),

  // Direct "Site Assigned" action - no popup, reuses the employee's
  // existing company (see backend reactivateEmployee).
  reactivateEmployee: (id) =>
    api.post(`/api/employees/${id}/reactivate`),
  
  getEmployeeAttendance: (id, params) =>
    api.get(`/api/employees/${id}/attendance`, { params }),

  // Real-time location (backed by EmployeeLocation + Socket.IO, see
  // backend/src/controllers/location.controller.js)
  getLatestLocation: (employeeId) =>
    api.get('/api/owner/locations/latest', { params: { employeeId } }),

  // getLocationHistory removed (dead code cleanup) - zero usage anywhere
  // in the frontend; getLatestLocation/requestCurrentLocation (used by
  // the live-tracking feature) are unaffected.

  requestCurrentLocation: (employeeId) =>
    api.post('/api/owner/locations/request', { employeeId })
}