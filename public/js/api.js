// ================================================
// HRIS API Client
// ================================================

const API_BASE = '/api';

const api = {
  // Dashboard
  async getDashboardStats() {
    const res = await fetch(`${API_BASE}/dashboard/stats`);
    return res.json();
  },

  // Employees
  async getEmployees() {
    const res = await fetch(`${API_BASE}/employees`);
    return res.json();
  },

  async getEmployee(id) {
    const res = await fetch(`${API_BASE}/employees/${id}`);
    return res.json();
  },

  async createEmployee(data) {
    const res = await fetch(`${API_BASE}/employees`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });
    return res.json();
  },

  async updateEmployee(id, data) {
    const res = await fetch(`${API_BASE}/employees/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });
    return res.json();
  },

  // Leave Quotas
  async getLeaveQuotas(employeeId) {
    const res = await fetch(`${API_BASE}/leave-quotas/${employeeId}`);
    return res.json();
  },

  async createLeaveQuota(data) {
    const res = await fetch(`${API_BASE}/leave-quotas`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });
    return res.json();
  },

  // Attendance Permissions
  async getAttendancePermissions(employeeId) {
    const url = employeeId
      ? `${API_BASE}/attendance-permissions?employeeId=${employeeId}`
      : `${API_BASE}/attendance-permissions`;
    const res = await fetch(url);
    return res.json();
  },

  async createAttendancePermission(data) {
    const res = await fetch(`${API_BASE}/attendance-permissions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });
    return res.json();
  },

  async updateAttendancePermission(id, data) {
    const res = await fetch(`${API_BASE}/attendance-permissions/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });
    return res.json();
  },

  // Business Trips
  async getBusinessTrips(employeeId) {
    const url = employeeId
      ? `${API_BASE}/business-trips?employeeId=${employeeId}`
      : `${API_BASE}/business-trips`;
    const res = await fetch(url);
    return res.json();
  },

  async createBusinessTrip(data) {
    const res = await fetch(`${API_BASE}/business-trips`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });
    return res.json();
  },

  async updateBusinessTrip(id, data) {
    const res = await fetch(`${API_BASE}/business-trips/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });
    return res.json();
  },
};

// Make api globally available
window.api = api;
