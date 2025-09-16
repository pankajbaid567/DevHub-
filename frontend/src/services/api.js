import axios from 'axios';

const API_BASE_URL = 'http://localhost:3000';

// Create axios instance
const api = axios.create({
  baseURL: API_BASE_URL,
});

// Attach JWT token to every request if available
api.interceptors.request.use((config) => {
  try {
    const token = localStorage.getItem('devhub_token');
    if (token) {
      config.headers = config.headers || {};
      config.headers.Authorization = `Bearer ${token}`;
    }
  } catch (_) {
    // no-op: accessing localStorage can fail in some environments
  }
  return config;
});

// Handle 401 responses globally
api.interceptors.response.use(
  (response) => response,
  (error) => {
    const status = error?.response?.status;
    if (status === 401) {
      try {
        localStorage.removeItem('devhub_token');
      } catch (_) {
        // ignore
      }
    }
    return Promise.reject(error);
  }
);

// Questions API
export const questionsAPI = {
  getAll: () => api.get('/api/questions'),
  getById: (id) => api.get(`/api/questions/${id}`),
  create: (data) => api.post('/api/questions', data),
  update: (id, data) => api.put(`/api/questions/${id}`, data),
  delete: (id) => api.delete(`/api/questions/${id}`),
};

// Answers API
export const answersAPI = {
  create: (data) => api.post('/api/answers', data),
  update: (id, data) => api.put(`/api/answers/${id}`, data),
  delete: (id) => api.delete(`/api/answers/${id}`),
};

// Snippets API
export const snippetsAPI = {
  getAll: () => api.get('/api/snippets'),
  getById: (id) => api.get(`/api/snippets/${id}`),
  create: (data) => api.post('/api/snippets', data),
  update: (id, data) => api.put(`/api/snippets/${id}`, data),
  delete: (id) => api.delete(`/api/snippets/${id}`),
};

// Users API
export const usersAPI = {
  getProfile: () => api.get('/api/users/profile'),
  updateProfile: (data) => api.put('/api/users/profile', data),
  getById: (id) => api.get(`/api/users/${id}`),
};

// Skill Ratings API
export const skillsAPI = {
  getAll: () => api.get('/api/skills'),
  create: (data) => api.post('/api/skills', data),
  update: (id, data) => api.put(`/api/skills/${id}`, data),
};

// Sessions API
export const sessionsAPI = {
  getAll: () => api.get('/api/sessions'),
  getById: (id) => api.get(`/api/sessions/${id}`),
  create: (data) => api.post('/api/sessions', data),
  join: (id) => api.post(`/api/sessions/${id}/join`),
  leave: (id) => api.post(`/api/sessions/${id}/leave`),
};

// Messages API
export const messagesAPI = {
  getBySession: (sessionId) => api.get(`/api/messages?sessionId=${sessionId}`),
  create: (data) => api.post('/api/messages', data),
};

// AI API
export const aiAPI = {
  mentor: (data) => api.post('/api/ai/mentor', data),
  resumeReview: (data) => api.post('/api/ai/resumeReview', data),
  skillRater: (data) => api.post('/api/ai/skillRater', data),
  generateCode: (data) => api.post('/api/ai/generate-code', data),
  reviewCode: (data) => api.post('/api/ai/review-code', data),
  explainCode: (data) => api.post('/api/ai/explain-code', data),
};

// Resume API
export const resumeAPI = {
  getAll: () => api.get('/api/resumes'),
  create: (data) => api.post('/api/resumes', data),
  review: (data) => aiAPI.resumeReview(data),
};

// Mentor API
export const mentorAPI = {
  chat: (data) => api.post('/api/mentor/chat', data),
  getHistory: (page = 1, limit = 20) => api.get(`/api/mentor/history?page=${page}&limit=${limit}`),
  deleteConversation: (id) => api.delete(`/api/mentor/history/${id}`),
};

export default api;