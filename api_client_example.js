/**
 * TruckXpress API Client Example
 * This file demonstrates how to connect your HTML frontend to the Node.js backend using fetch.
 * You can include this in your frontend or use the logic within your existing scripts.
 */

const API_BASE_URL = 'http://localhost:5001/api';
let authToken = localStorage.getItem('truckxpress_token') || null;

// Helper function to handle fetch with auth
async function apiFetch(endpoint, method = 'GET', body = null) {
  const headers = {
    'Content-Type': 'application/json'
  };

  if (authToken) {
    headers['Authorization'] = `Bearer ${authToken}`;
  }

  const options = {
    method,
    headers
  };

  if (body) {
    options.body = JSON.stringify(body);
  }

  const response = await fetch(`${API_BASE_URL}${endpoint}`, options);
  const data = await response.json();
  
  if (!response.ok) {
    throw new Error(data.error || 'API Request Failed');
  }

  return data;
}

const TruckXpressAPI = {
  // --- AUTHENTICATION ---
  
  register: async (userData) => {
    try {
      // userData should include: role ('company' or 'driver'), name, email, password, etc.
      // E.g. { role: "company", name: "John", email: "john@co.com", password: "123", companyName: "Logistics" }
      const res = await apiFetch('/auth/register', 'POST', userData);
      if (res.token) {
        authToken = res.token;
        localStorage.setItem('truckxpress_token', authToken);
      }
      return res.user;
    } catch (err) {
      console.error("Registration error:", err.message);
      throw err;
    }
  },

  login: async (email, password) => {
    try {
      const res = await apiFetch('/auth/login', 'POST', { email, password });
      if (res.token) {
        authToken = res.token;
        localStorage.setItem('truckxpress_token', authToken);
      }
      return res.user;
    } catch (err) {
      console.error("Login error:", err.message);
      throw err;
    }
  },

  logout: () => {
    authToken = null;
    localStorage.removeItem('truckxpress_token');
  },

  // --- LOADS (COMPANY) ---

  postLoad: async (loadData) => {
    // loadData: origin, destination, weight, goodsType, expectedRate, pickupDate
    return await apiFetch('/loads', 'POST', loadData);
  },

  getMyLoads: async () => {
    return await apiFetch('/loads', 'GET');
  },

  acceptBid: async (loadId, bidId) => {
    return await apiFetch(`/loads/${loadId}/accept-bid`, 'POST', { bidId });
  },

  // --- LOADS (DRIVER) ---

  getNearbyLoads: async (lng, lat, distance = 50) => {
    return await apiFetch(`/loads/nearby?lng=${lng}&lat=${lat}&distance=${distance}`, 'GET');
  },

  placeBid: async (loadId, amount) => {
    return await apiFetch(`/loads/${loadId}/bid`, 'POST', { amount });
  },

  updateLoadStatus: async (loadId, status) => {
    // status: 'in_transit', 'delivered', etc.
    return await apiFetch(`/loads/${loadId}/status`, 'PUT', { status });
  }
};

// --- SOCKET.IO EXAMPLE ---
/*
  To use real-time features, you need to include socket.io-client in your HTML:
  <script src="https://cdn.socket.io/4.7.2/socket.io.min.js"></script>
  
  Then connect like this:
  
  const socket = io('http://localhost:5000');
  
  // Join personal notification room
  socket.emit('join', { userId: 'YOUR_USER_ID', role: 'driver' });

  // Listen for new loads (if driver)
  socket.on('new_load', (load) => {
    console.log("New load posted nearby:", load);
  });

  // Emit GPS updates (if driver)
  setInterval(() => {
    socket.emit('update_location', { userId: 'YOUR_USER_ID', lng: 73.8567, lat: 18.5204 });
  }, 10000);
*/
