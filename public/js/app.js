/**
 * MediVault Application Entrypoint
 */

import Store from './store.js';
import api from './api.js';
import { handleRouteChange } from './router.js';

async function bootstrap() {
  // If stored token exists, attempt to verify and refresh user state
  if (Store.state.token) {
    try {
      const refreshedUser = await api.getMe();
      Store.setUser(refreshedUser, Store.state.token);
    } catch (err) {
      console.warn('Session verification failed, logging out:', err.message);
      Store.logout();
    }
  }

  // Handle routing events
  window.addEventListener('hashchange', () => {
    handleRouteChange();
  });

  // Initial route handle
  handleRouteChange();
}

window.addEventListener('DOMContentLoaded', bootstrap);

