window.addEventListener('DOMContentLoaded', async () => {
  const pageContent = document.getElementById('page-content');
  const authControls = document.getElementById('auth-controls');
  const cartControls = document.getElementById('cart-controls');

  // Base URL for the backend API.
  const API_BASE_URL = 'https://www.sr.example.com:8000/api';

  // URL to fetch the current user's information.
  const CURRENT_USER_API_URL = 'https://www.sr.example.com:8000/shop/api/me';

  // Base URL for static assets like images.
  const STATIC_ASSETS_BASE_URL = `https://sirius.sr.example.com:8000/images`;

  let user = null;
  let allFruits = []; // To cache the list of fruits from the API
  let fruitsFetched = false; // Flag to prevent re-fetching in a loop
  let cart = []; // To hold cart items: [{ id, name, price, quantity }]

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
        total += (item.price || 0) * item.quantity;
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
    console.log(`${fruit.name} added to cart.`);
  };

  const updateQuantity = (fruitId, change) => {
    const cartItem = cart.find(item => item.id === fruitId);
    if (!cartItem) return;

    cartItem.quantity += change;

    if (cartItem.quantity <= 0) {
      cart = cart.filter(item => item.id !== fruitId);
    }
    saveCart();
    renderCartPage(); // Re-render the cart page
  };

  const clearCart = () => {
    cart = [];
    saveCart();
    renderCartPage();
  };

  // Fetches a single fruit's details from the backend API
  const fetchFruitDetails = async (fruitId) => {
    const apiUrl = `${API_BASE_URL}/fruits/${fruitId}`;

    try {
      const response = await fetch(apiUrl, { credentials: 'include' });

      if (response.ok) {
        return await response.json();
      }

      if (response.status === 404) {
        throw new Error(`Fruit with ID ${fruitId} not found.`);
      }

      const errorText = await response.text();
      throw new Error(`Server error (HTTP ${response.status}): ${errorText}`);
    } catch (error) {
      console.error('Error fetching fruit details:', error);
      throw error;
    }
  };

  // Fetches fruits from the backend API
  const fetchFruits = async () => {
    // Mark as fetched once we start the process.
    // This prevents re-fetching in a loop if the API returns an empty array.
    fruitsFetched = true;

    const apiUrl = `${API_BASE_URL}/fruits`;

    try {
      const response = await fetch(apiUrl, { credentials: 'include' });

      if (response.ok) {
        const fruits = await response.json();
        allFruits = fruits; // Cache the fruit list
        renderListPage(); // Render the page with the fetched data
        return;
      }

      const errorText = await response.text();
      throw new Error(`Server error (HTTP ${response.status}): ${errorText}`);
    } catch (error) {
      console.error('Error fetching fruits:', error);
      pageContent.innerHTML = `<p>Failed to fetch data. Please check your connection and try again.</p>`;
    }
  };

  // --- Main Application Router and Initializer ---

  const updateUI = async () => {
    updateCartControls();

    if (user && user.name) {
      authControls.innerHTML = `<span class="login-status">Logged in as: <strong>${user.name}</strong></span>`;
    } else {
      authControls.innerHTML = '';
    }

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

    try {
      const response = await fetch(`${CURRENT_USER_API_URL}`, { credentials: 'include' });
      if (response.ok) {
        user = await response.json();
      }
    } catch (e) {
      console.error('Failed to fetch user info:', e);
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
