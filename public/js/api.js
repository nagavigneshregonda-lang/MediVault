/**
 * MediVault API Client Wrapper
 */

import Store from './store.js';
import { showToast } from './components/toast.js';

const API_BASE = '/api';

async function request(endpoint, options = {}) {
  const headers = {
    'Content-Type': 'application/json',
    ...(options.headers || {})
  };

  const token = Store.state.token;
  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  const config = {
    ...options,
    headers
  };

  try {
    const res = await fetch(`${API_BASE}${endpoint}`, config);
    const data = await res.json().catch(() => ({}));

    if (!res.ok) {
      if (res.status === 401) {
        // Token expired or invalid
        if (Store.isAuthenticated()) {
          showToast('Session expired. Please log in again.', 'warning');
          Store.logout();
        }
      }

      // Check for allergy conflict
      if (res.status === 409 && data.warningType === 'DRUG_ALLERGY_CONFLICT') {
        const error = new Error(data.message);
        error.isAllergyConflict = true;
        error.allergyConflict = data.allergyConflict;
        error.status = 409;
        throw error;
      }

      const error = new Error(data.message || `Request failed with status ${res.status}`);
      error.status = res.status;
      error.data = data;
      throw error;
    }

    return data;
  } catch (err) {
    throw err;
  }
}

const api = {
  // Auth
  async login(email, password) {
    const res = await request('/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email, password })
    });
    return res.data;
  },

  async getMe() {
    const res = await request('/auth/me');
    return res.data;
  },

  async logout() {
    try {
      await request('/auth/logout', { method: 'POST' });
    } catch (e) {
      // ignore
    }
  },

  async changePassword(currentPassword, newPassword) {
    const res = await request('/auth/change-password', {
      method: 'POST',
      body: JSON.stringify({ current_password: currentPassword, new_password: newPassword })
    });
    return res.data;
  },

  // Users
  async getUsers(role = '') {
    const query = role ? `?role=${encodeURIComponent(role)}` : '';
    const res = await request(`/users${query}`);
    return res.data;
  },

  async createUser(userData) {
    const res = await request('/users', {
      method: 'POST',
      body: JSON.stringify(userData)
    });
    return res.data;
  },

  // Patients
  async getPatients(params = {}) {
    const searchParams = new URLSearchParams(params).toString();
    const res = await request(`/patients${searchParams ? '?' + searchParams : ''}`);
    return res.data;
  },

  async getPatient(id) {
    const res = await request(`/patients/${id}`);
    return res.data;
  },

  async createPatient(patientData) {
    const res = await request('/patients', {
      method: 'POST',
      body: JSON.stringify(patientData)
    });
    return res.data;
  },

  async updatePatient(id, patientData) {
    const res = await request(`/patients/${id}`, {
      method: 'PUT',
      body: JSON.stringify(patientData)
    });
    return res.data;
  },

  async deletePatient(id) {
    const res = await request(`/patients/${id}`, {
      method: 'DELETE'
    });
    return res.data;
  },

  async restorePatient(id) {
    const res = await request(`/patients/${id}/restore`, {
      method: 'POST'
    });
    return res.data;
  },

  async createPatientLogin(patientId, data) {
    const res = await request(`/patients/${patientId}/create-login`, {
      method: 'POST',
      body: JSON.stringify(data)
    });
    return res.data;
  },

  async resetPatientPassword(patientId, data) {
    const res = await request(`/patients/${patientId}/reset-password`, {
      method: 'POST',
      body: JSON.stringify(data)
    });
    return res.data;
  },

  // Medical History
  async getMedicalHistory(patientId) {
    const res = await request(`/patients/${patientId}/history`);
    return res.data;
  },

  async addMedicalHistory(patientId, entryData) {
    const res = await request(`/patients/${patientId}/history`, {
      method: 'POST',
      body: JSON.stringify(entryData)
    });
    return res.data;
  },

  async updateMedicalHistory(patientId, historyId, entryData) {
    const res = await request(`/patients/${patientId}/history/${historyId}`, {
      method: 'PUT',
      body: JSON.stringify(entryData)
    });
    return res.data;
  },

  async deleteMedicalHistory(patientId, historyId) {
    const res = await request(`/patients/${patientId}/history/${historyId}`, {
      method: 'DELETE'
    });
    return res.data;
  },

  // Prescriptions
  async getPrescriptions(patientId, status = '') {
    const query = status ? `?status=${encodeURIComponent(status)}` : '';
    const res = await request(`/patients/${patientId}/prescriptions${query}`);
    return res.data;
  },

  async getPrescription(patientId, prescriptionId) {
    const res = await request(`/patients/${patientId}/prescriptions/${prescriptionId}`);
    return res.data;
  },

  async addPrescription(patientId, prescriptionData) {
    const res = await request(`/patients/${patientId}/prescriptions`, {
      method: 'POST',
      body: JSON.stringify(prescriptionData)
    });
    return res.data;
  },

  async updatePrescriptionStatus(patientId, prescriptionId, status, notes = '') {
    const res = await request(`/patients/${patientId}/prescriptions/${prescriptionId}/status`, {
      method: 'PATCH',
      body: JSON.stringify({ status, notes })
    });
    return res.data;
  },

  // Diagnostic Tests
  async getPatientTests(patientId, params = {}) {
    const searchParams = new URLSearchParams(params).toString();
    const res = await request(`/patients/${patientId}/tests${searchParams ? '?' + searchParams : ''}`);
    return res.data;
  },

  async getAllTests(params = {}) {
    const searchParams = new URLSearchParams(params).toString();
    const res = await request(`/tests${searchParams ? '?' + searchParams : ''}`);
    return res.data;
  },

  async orderTest(patientId, testData) {
    const res = await request(`/patients/${patientId}/tests`, {
      method: 'POST',
      body: JSON.stringify(testData)
    });
    return res.data;
  },

  async updateTestResult(testId, testData) {
    const res = await request(`/tests/${testId}`, {
      method: 'PUT',
      body: JSON.stringify(testData)
    });
    return res.data;
  },

  // Health Trends
  async getPatientTrend(patientId) {
    const res = await request(`/patients/${patientId}/trends`);
    return res.data;
  },

  // Authorized Access Grants
  async getAllGrants() {
    const res = await request('/access');
    return res.data;
  },

  async getDoctorsForGrant() {
    const res = await request('/access/doctors');
    return res.data;
  },

  async getPatientGrants(patientId) {
    const res = await request(`/access/patient/${patientId}`);
    return res.data;
  },

  async grantAccess(patientId, doctorId, expiresAt = null, notes = '') {
    const res = await request('/access/grant', {
      method: 'POST',
      body: JSON.stringify({ patient_id: patientId, doctor_id: doctorId, expires_at: expiresAt, notes })
    });
    return res.data;
  },

  async revokeAccess(patientId, doctorId, grantId = null) {
    const res = await request('/access/revoke', {
      method: 'POST',
      body: JSON.stringify({ patient_id: patientId, doctor_id: doctorId, grant_id: grantId })
    });
    return res.data;
  },

  // Audit Logs
  async getAuditLogs(params = {}) {
    const searchParams = new URLSearchParams(params).toString();
    const res = await request(`/audit${searchParams ? '?' + searchParams : ''}`);
    return res.data;
  },

  // Dashboard Stats
  async getDashboardStats() {
    const res = await request('/stats/dashboard');
    return res.data;
  }
};

export default api;

