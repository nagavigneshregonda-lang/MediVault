/**
 * Global State Store for MediVault
 */

const Store = {
  state: {
    user: JSON.parse(localStorage.getItem('medivault_user') || 'null'),
    token: localStorage.getItem('medivault_token') || null,
    theme: localStorage.getItem('medivault_theme') || 'light',
    currentPatient: null
  },

  listeners: [],

  subscribe(listener) {
    this.listeners.push(listener);
    return () => {
      this.listeners = this.listeners.filter(l => l !== listener);
    };
  },

  notify() {
    this.listeners.forEach(l => l(this.state));
  },

  setUser(user, token) {
    this.state.user = user;
    this.state.token = token;
    if (user && token) {
      localStorage.setItem('medivault_user', JSON.stringify(user));
      localStorage.setItem('medivault_token', token);
    } else {
      localStorage.removeItem('medivault_user');
      localStorage.removeItem('medivault_token');
    }
    this.notify();
  },

  setTheme(theme) {
    this.state.theme = theme;
    localStorage.setItem('medivault_theme', theme);
    document.documentElement.setAttribute('data-theme', theme);
    this.notify();
  },

  toggleTheme() {
    const nextTheme = this.state.theme === 'dark' ? 'light' : 'dark';
    this.setTheme(nextTheme);
  },

  setCurrentPatient(patient) {
    this.state.currentPatient = patient;
    this.notify();
  },

  isAuthenticated() {
    return !!(this.state.user && this.state.token);
  },

  hasRole(...roles) {
    if (!this.state.user) return false;
    return roles.includes(this.state.user.role);
  },

  logout() {
    this.setUser(null, null);
    this.state.currentPatient = null;
    window.location.hash = '#login';
  }
};

// Initialize theme from storage
document.documentElement.setAttribute('data-theme', Store.state.theme);
window.Store = Store;

export default Store;

