window.addEventListener('DOMContentLoaded', async () => {
  const pageContent = document.getElementById('page-content');
  const authControls = document.getElementById('auth-controls');
  const cartControls = document.getElementById('cart-controls');

  // Base URL for the backend API.
  const API_BASE_URL = 'http://localhost:5001/api';

  // Base URL for static assets like images.
  const STATIC_ASSETS_BASE_URL = `${window.location.origin}/images`;

  // OIDC Configuration
  const oidcConfig = {
    issuer: 'http://localhost:8082',
    clientId: 'fruit-shop',
    // Always redirect to the root of the application after login.
    // This must match one of the URIs registered in the auth server.
    // This is more robust than using window.location.pathname.
    redirectUri: `${window.location.origin}/shop/`,
    // Request 'offline_access' to get a refresh token for persistent sessions.
    // The term 'offline' here refers to the user not being present, allowing the
    // application to refresh tokens in the background without user interaction.
    scope: 'openid profile offline_access',
  };

  let accessToken = null;
  let refreshToken = null;
  let user = null;
  let allFruits = []; // To cache the list of fruits from the API
  let fruitsFetched = false; // Flag to prevent re-fetching in a loop
  let cart = []; // To hold cart items: [{ id, name, price, quantity }]

  // --- Helper Functions ---

  // Parses the payload of a JWT token
  const parseJwt = (token) => {
    try {
      const base64Url = token.split('.')[1];
      const base64 = base64Url.replace(/-/g, '+').replace(/_/g, '/');
      const jsonPayload = decodeURIComponent(atob(base64).split('').map(function(c) {
          return '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2);
      }).join(''));
      return JSON.parse(jsonPayload);
    } catch (e) {
      console.error("Failed to parse JWT", e);
      return null;
    }
  };

  // --- PKCE Helper Functions ---

  // Generates a cryptographically random string for the code_verifier
  const generateCodeVerifier = () => {
    const randomBytes = new Uint8Array(32);
    window.crypto.getRandomValues(randomBytes);
    return btoa(String.fromCharCode.apply(null, randomBytes)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');
  };

  // Hashes the code_verifier to create the code_challenge
  const generateCodeChallenge = async (verifier) => {
    const encoder = new TextEncoder();
    const data = encoder.encode(verifier);
    const hash = await window.crypto.subtle.digest('SHA-256', data);
    return btoa(String.fromCharCode.apply(null, new Uint8Array(hash))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');
  };
  // --- UI Rendering ---

  const renderListPage = () => {
    pageContent.innerHTML = `
      <h2 class="page-title">Our Fruits</h2>
      <div id="fruit-list"></div>
    `;
    const fruitList = document.getElementById('fruit-list');
    // Check if fruits have been fetched, not if the array is empty
    if (!fruitsFetched) {
      fruitList.innerHTML = '<p>Loading fruits...</p>';
      // Fetch fruits if not already loaded
      fetchFruits();
    } else {
      fruitList.innerHTML = ''; // Clear existing messages
      if (allFruits.length === 0) {
        // Handle the case where the API returns an empty list
        fruitList.innerHTML = '<p>No fruits available at the moment.</p>';
      } else {
        allFruits.forEach(fruit => {
          const item = document.createElement('div');
          item.dataset.fruitId = fruit.id; // Add ID for navigation
          item.className = 'fruit-item';
          item.innerHTML = `
            <img src="${STATIC_ASSETS_BASE_URL}/${fruit.name}.png" alt="${fruit.name}" class="fruit-image" onerror="this.style.display='none'">
            <div class="fruit-info">
              <h3>${fruit.name}</h3>
              <p>Origin: ${fruit.origin}</p>
              <p class="price">${fruit.price ? fruit.price + ' yen' : 'Price TBD'}</p>
              <button class="button button-success add-to-cart-button" data-fruit-id="${fruit.id}">Add to Cart</button>
            </div>`;
          fruitList.appendChild(item);
        });
      }
    }
  };

  const renderDetailPage = async (fruitId) => {
    pageContent.innerHTML = '<p>Loading fruit details...</p>';
    try {
        const fruit = await fetchFruitDetails(fruitId);
        if (!fruit) {
            pageContent.innerHTML = '<p>Could not load fruit details. The fruit may not exist or an authentication error occurred.</p>';
            return;
        }

        pageContent.innerHTML = `
            <div class="fruit-detail-container">
                <a href="#" class="back-link">&larr; Back to list</a>
                <div class="fruit-detail-content">
                    <img src="${STATIC_ASSETS_BASE_URL}/${fruit.name}.png" alt="${fruit.name}" class="fruit-detail-image" onerror="this.style.display='none'">
                    <div class="fruit-detail-info">
                        <h1>${fruit.name}</h1>
                        <p class="detail-origin"><strong>Origin:</strong> ${fruit.origin}</p>
                        <p class="detail-price">${fruit.price} yen</p>
                        <p class="detail-description">${fruit.description || 'No description available.'}</p>
                        <button class="button button-success add-to-cart-button" data-fruit-id="${fruit.id}">Add to Cart</button>
                        ${fruit.origin_latitude && fruit.origin_longitude ? `
                        <div class="detail-location">
                            <p><strong>Approx. Origin Coordinates:</strong> Latitude: ${fruit.origin_latitude.toFixed(1)}, Longitude: ${fruit.origin_longitude.toFixed(1)}</p>
                        </div>
                        ` : ''}
                    </div>
                </div>
            </div>
        `;
    } catch (error) {
        console.error('Error rendering detail page:', error);
        pageContent.innerHTML = `<p>Failed to load fruit details. Please check the console for more information.</p>`;
    }
  };

  const renderCartPage = () => {
    let cartHTML = `
      <h2 class="page-title">Your Shopping Cart</h2>
      <div class="cart-container">
    `;
    if (cart.length === 0) {
      cartHTML += '<p>Your cart is empty. <a href="#">Go back to shopping</a>.</p>';
    } else {
      let total = 0;
      cart.forEach(item => {
        total += item.price * item.quantity;
        cartHTML += `
          <div class="cart-item">
            <img src="${STATIC_ASSETS_BASE_URL}/${item.name}.png" alt="${item.name}" class="fruit-image" style="width: 80px; height: 80px; object-fit: cover; border-radius: 4px;">
            <div class="cart-item-info">
              <h3>${item.name}</h3>
              <p>${item.price} yen</p>
            </div>
            <div class="cart-item-actions">
              <button class="update-quantity-button" data-fruit-id="${item.id}" data-change="-1">-</button>
              <span style="margin: 0 1rem; font-weight: bold;">${item.quantity}</span>
              <button class="update-quantity-button" data-fruit-id="${item.id}" data-change="1">+</button>
            </div>
          </div>
        `;
      });
      cartHTML += `
        <div class="cart-summary">
          <h2>Total: ${total} yen</h2>
          <div class="cart-summary-actions">
            <a href="#" class="button button-primary">Back to Shopping</a>
            <button class="button button-danger clear-cart-button">Clear Cart</button>
          </div>
        </div>
      `;
    }
    cartHTML += '</div>';
    pageContent.innerHTML = cartHTML;
  };

  const updateCartControls = () => {
    const itemCount = cart.reduce((sum, item) => sum + item.quantity, 0);
    cartControls.innerHTML = `<a href="#cart">Cart (${itemCount})</a>`;
  };

  // --- Cart Logic ---

  const saveCart = () => {
    localStorage.setItem('cart', JSON.stringify(cart));
    updateCartControls();
  };

  const addToCart = (fruitId) => {
    const fruit = allFruits.find(f => f.id === fruitId);
    if (!fruit) return;

    const cartItem = cart.find(item => item.id === fruitId);
    if (cartItem) {
      cartItem.quantity++;
    } else {
      cart.push({ id: fruit.id, name: fruit.name, price: fruit.price, quantity: 1 });
    }
    saveCart();
    console.log('[addToCart] Item added successfully.', { id: fruit.id, name: fruit.name });
  };

  const updateQuantity = (fruitId, change) => {
    const cartItem = cart.find(item => item.id === fruitId);
    if (!cartItem) return;

    console.log(`[updateQuantity] Updating quantity for item ${fruitId} by ${change}.`);
    cartItem.quantity += change;

    if (cartItem.quantity <= 0) {
      cart = cart.filter(item => item.id !== fruitId);
    }
    saveCart();
    renderCartPage(); // Re-render the cart page
  };

  const clearCart = () => {
    console.log('[clearCart] Clearing all items from the cart.');
    cart = [];
    saveCart();
    renderCartPage();
  };

  // Redirects to the OIDC server for login
  const login = async () => {
    try {
      console.log('[login] Redirecting to authentication server...');
      // Generate a random string for the state parameter (CSRF protection)
      const state = Math.random().toString(36).substring(2);
      sessionStorage.setItem('oidc-state', state);

      // Generate and store the PKCE code verifier
      const codeVerifier = generateCodeVerifier();
      sessionStorage.setItem('oidc-code-verifier', codeVerifier);
      const codeChallenge = await generateCodeChallenge(codeVerifier);

      const params = new URLSearchParams({
        response_type: 'code',
        client_id: oidcConfig.clientId,
        redirect_uri: oidcConfig.redirectUri,
        scope: oidcConfig.scope,
        state: state,
        code_challenge: codeChallenge,
        code_challenge_method: 'S256',
      });

      window.location.href = `${oidcConfig.issuer}/authorize?${params.toString()}`;
    } catch (error) {
      console.error('Login failed:', error);
      alert('Login process failed. Please check the console for more details. This might be due to an insecure connection (non-HTTPS or non-localhost).');
    }
  };

  // Clears session and updates UI
  const logout = async () => {
    console.log('[logout] Starting logout process...');
    // Retrieve the token from memory or localStorage on token expiry.
    const tokenToRevoke = accessToken || localStorage.getItem('access_token');

    if (tokenToRevoke) {
      try {
        // Send logout notification to the server and disable the refresh token.
        const response = await fetch(`${oidcConfig.issuer}/api/logout`, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${tokenToRevoke}`
          }
        });
        if (response.ok) {
          console.log('Server-side session successfully revoked.');
        }
      } catch (error) {
        console.error('Failed to revoke server-side session, but proceeding with client-side logout.', error);
      }
    }

    // Clear client state regardless of server outcome
    accessToken = null;
    user = null;
    refreshToken = null;
    localStorage.removeItem('access_token');
    localStorage.removeItem('user');
    localStorage.removeItem('refresh_token');
    window.location.hash = ''; // Move to homepage after logout
    updateUI();
  };

  // Exchanges the authorization code for an access token
  const exchangeCodeForToken = async (code) => {
    console.log('[exchangeCodeForToken] Starting token exchange process...');
    const codeVerifier = sessionStorage.getItem('oidc-code-verifier');
    console.log('[exchangeCodeForToken] Retrieved code_verifier from sessionStorage.');
    sessionStorage.removeItem('oidc-code-verifier');
    try {
      const response = await fetch(`${oidcConfig.issuer}/api/token`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: new URLSearchParams({
          grant_type: 'authorization_code',
          code: code,
          redirect_uri: oidcConfig.redirectUri,
          client_id: oidcConfig.clientId,
          code_verifier: codeVerifier, // Add the verifier for PKCE
        }),
      });

      console.log(`[exchangeCodeForToken] Received response with status: ${response.status}`);
      if (!response.ok) {
        const errorText = await response.text();
        console.error(`[exchangeCodeForToken] Token exchange failed. Server responded with: ${errorText}`);
        throw new Error(`Token exchange failed: ${response.statusText}`);
      }

      const data = await response.json();
      if (data.access_token && data.id_token) {
        accessToken = data.access_token;
        localStorage.setItem('access_token', accessToken);
        console.log('[exchangeCodeForToken] Access token stored in localStorage.');

        if (data.refresh_token) {
          refreshToken = data.refresh_token;
          localStorage.setItem('refresh_token', refreshToken);
          console.log('[exchangeCodeForToken] Refresh token stored in localStorage.');
        }

        const idTokenPayload = parseJwt(data.id_token);
        if (idTokenPayload && idTokenPayload.name) {
          user = { name: idTokenPayload.name };
          localStorage.setItem('user', JSON.stringify(user));
          console.log('[exchangeCodeForToken] User info stored in localStorage:', user);
        }
      }
      console.log('[exchangeCodeForToken] Token exchange process finished successfully.');
    } catch (error) {
      console.error('Error exchanging code for token:', error);
      pageContent.innerHTML = `<p>Authentication failed. Please try logging in again.</p>`;
    }
  };

  // Uses the refresh token to get a new access token
  const refreshAccessToken = async () => {
    const storedRefreshToken = localStorage.getItem('refresh_token');
    if (!storedRefreshToken) {
      console.log('No refresh token found. Logging out.');
      logout();
      return null;
    }

    try {
      const response = await fetch(`${oidcConfig.issuer}/api/token`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          grant_type: 'refresh_token',
          refresh_token: storedRefreshToken,
          client_id: oidcConfig.clientId,
        }),
      });

      if (!response.ok) {
        throw new Error('Refresh token exchange failed, server responded with ' + response.status);
      }

      const data = await response.json();
      if (data.access_token) {
        accessToken = data.access_token;
        localStorage.setItem('access_token', accessToken);

        // Optionally update user info if a new ID token is provided
        if (data.id_token) {
          const idTokenPayload = parseJwt(data.id_token);
          if (idTokenPayload && idTokenPayload.name) {
            user = { name: idTokenPayload.name };
            localStorage.setItem('user', JSON.stringify(user));
          }
        }
        return accessToken;
      } else {
        throw new Error('No access token in refresh response');
      }
    } catch (error) {
      console.error('Error refreshing token:', error);
      // The refresh token is likely invalid or expired, so log out completely.
      logout();
      return null;
    }
  };

  // Fetches a single fruit's details from the protected backend API
  const fetchFruitDetails = async (fruitId) => {
    if (!accessToken) {
      console.log("fetchFruitDetails: Not logged in, skipping fetch.");
      throw new Error("Not authenticated. Please log in.");
    }

    const apiUrl = `${API_BASE_URL}/fruits/${fruitId}`;

    // Try fetching, with one retry attempt after a token refresh.
    for (let attempt = 0; attempt < 2; attempt++) {
        console.log(`[fetchFruitDetails] Attempt ${attempt + 1}: Fetching details for fruit ID ${fruitId} from ${apiUrl}`);
        const response = await fetch(apiUrl, {
            headers: { 'Authorization': `Bearer ${accessToken}` }
        });

        if (response.ok) {
            return await response.json();
        }

        if (response.status === 404) {
            throw new Error(`Fruit with ID ${fruitId} not found.`);
        }

        if (response.status !== 401) {
            const errorText = await response.text();
            throw new Error(`Server error (HTTP ${response.status}): ${errorText}`);
        }

        if (attempt > 0) {
            console.error('API call for details failed with 401 even after refreshing token. Logging out.');
            logout();
            throw new Error('Authentication failed after token refresh.');
        }

        console.log('Access token expired or invalid. Attempting to refresh...');
        const newAccessToken = await refreshAccessToken();
        if (!newAccessToken) {
            throw new Error('Token refresh failed.');
        }
        console.log('Token refreshed successfully. Retrying API call for details...');
    }
    throw new Error('Failed to fetch fruit details after all attempts.');
  };

  // Fetches fruits from the protected backend API
  const fetchFruits = async () => {
    if (!accessToken) {
      console.log("fetchFruits: Not logged in, skipping fetch.");
      return;
    }

    // Mark as fetched once we start the process.
    // This prevents re-fetching in a loop if the API returns an empty array.
    fruitsFetched = true;

    const apiUrl = `${API_BASE_URL}/fruits`;

    // Try fetching, with one retry attempt after a token refresh.
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        console.log(`[fetchFruits] Attempt ${attempt + 1}: Fetching all fruits from ${apiUrl}`);
        const response = await fetch(apiUrl, {
          headers: {
            'Authorization': `Bearer ${accessToken}`
          }
        });

        if (response.ok) {
          const fruits = await response.json();
          allFruits = fruits; // Cache the fruit list
          renderListPage(); // Render the page with the fetched data
          return; // Success, exit the function.
        }

        if (response.status !== 401) {
          // Handle non-authentication errors (e.g., 500 Internal Server Error)
          const errorText = await response.text();
          throw new Error(`Server error (HTTP ${response.status}): ${errorText}`);
        }

        // If we are here, it's a 401 error.
        // On the first attempt, try to refresh the token.
        // On the second attempt, fail and log out.
        if (attempt > 0) {
          console.error('API call failed with 401 even after refreshing token. Logging out.');
          logout();
          return;
        }

        console.log('Access token expired or invalid. Attempting to refresh...');
        const newAccessToken = await refreshAccessToken();
        if (!newAccessToken) {
          // refreshAccessToken already handled the logout process. Stop everything.
          console.log("fetchFruits: Token refresh failed, stopping attempts.");
          return;
        }
        // If refresh was successful, the loop will continue for the second attempt.
        console.log('Token refreshed successfully. Retrying API call...');

      } catch (error) {
        // This catches network errors or errors thrown from non-ok responses.
        console.error('Error fetching fruits:', error);
        pageContent.innerHTML = `<p>Failed to fetch data. Please check your connection and try again.</p>`;
        return; // Exit the function on error.
      }
    }
  };

  // --- Main Application Router and Initializer ---

  const updateUI = async () => {
    const isAuthenticated = !!accessToken && !!user;
    updateCartControls();

    if (isAuthenticated) {
      console.log('[updateUI] User is authenticated. Rendering main view.');
      authControls.innerHTML = `
        <span class="login-status">Logged in as: <strong>${user.name}</strong></span>
        <button id="logout-button" class="button button-primary">Logout</button>
      `;
      document.getElementById('logout-button').addEventListener('click', logout);

      // Simple hash-based routing
      const hash = window.location.hash;
      if (hash.startsWith('#/fruits/')) {
        const fruitId = hash.substring('#/fruits/'.length);
        renderDetailPage(fruitId);
      } else if (hash === '#cart') {
        renderCartPage();
      } else {
        renderListPage();
      }
    } else {
      console.log('[updateUI] User is not authenticated. Rendering login view.');
      authControls.innerHTML = `
        <span class="login-status">Not logged in</span>
        <button id="login-button" class="button button-primary">Login</button>
      `;
      document.getElementById('login-button').addEventListener('click', login);
      pageContent.innerHTML = '<p>Please log in to see the fruits.</p>';
    }
  };

  const init = async () => {
    // Load cart from localStorage
    const storedCart = localStorage.getItem('cart');
    if (storedCart) {
      try {
        cart = JSON.parse(storedCart);
      } catch (e) {
        console.error("Failed to parse cart from localStorage", e);
        localStorage.removeItem('cart');
      }
    }

  console.log('[init] Checking for authorization code in URL...');
  const params = new URLSearchParams(window.location.search);
  const code = params.get('code');
  const state = params.get('state');

  if (code && state) {
    console.log(`[init] Found 'code' and 'state' in URL parameters.`);
    console.log(`[init] Code: ${code.substring(0, 10)}... (truncated)`);
    console.log(`[init] State: ${state}`);
    const savedState = sessionStorage.getItem('oidc-state');
    console.log(`[init] Retrieved saved state from sessionStorage: ${savedState}`);
    sessionStorage.removeItem('oidc-state');
    window.history.replaceState({}, document.title, window.location.pathname);

    if (state === savedState) {
      console.log('[init] State matches. Proceeding to exchange code for token.');
      await exchangeCodeForToken(code);
    } else {
      console.error(`[init] State mismatch! CSRF attack? URL state: ${state}, Saved state: ${savedState}`);
      pageContent.innerHTML = `<p>Authentication failed due to invalid state. Please try again.</p>`;
    }
  } else {
    accessToken = localStorage.getItem('access_token');
    refreshToken = localStorage.getItem('refresh_token');
    const storedUser = localStorage.getItem('user');
    if (accessToken && storedUser) {
        try {
            user = JSON.parse(storedUser);
        } catch (e) {
            console.error("Failed to parse user from localStorage", e);
            logout(); // Clear invalid state
        }
    }
  }

    await updateUI();
  };

  // --- Event Listeners ---

  // Listen for hash changes to switch pages
  window.addEventListener('hashchange', updateUI);

  // Use event delegation for dynamically added buttons
  pageContent.addEventListener('click', (e) => {
    if (e.target.matches('.add-to-cart-button')) {
      addToCart(e.target.dataset.fruitId);
    } else if (e.target.matches('.update-quantity-button')) {
      updateQuantity(e.target.dataset.fruitId, parseInt(e.target.dataset.change, 10));
    } else if (e.target.matches('.clear-cart-button')) {
      clearCart();
    } else if (e.target.closest('.fruit-item') && !e.target.closest('button')) {
      // Navigate to detail page if a card is clicked, but not its button
      const fruitId = e.target.closest('.fruit-item').dataset.fruitId;
      if (fruitId) window.location.hash = `#/fruits/${fruitId}`;
    }
  });

  init();
});
