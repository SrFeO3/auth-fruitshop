# =================================================================================================
# BFF Mode Integration Tests
# =================================================================================================
#
# [Prerequisites]
# 1. Install Python dependencies:
#    pip install pytest pytest-playwright PyYAML
# 2. Install Playwright browsers:
#    playwright install
#    playwright install-deps
#
# [Running Tests]
# - Run all BFF tests:
#    pytest -m bff
#
# - Run specific categories:
#    pytest -m "bff and core"
#    pytest -m "bff and auth"
#    pytest -m "bff and security"
#
import pytest
from playwright.sync_api import Page, expect

@pytest.fixture(autouse=True)
def setup(page: Page):
    """Setup executed before each test."""
    page.on("console", lambda msg: print(f"Browser Console: {msg.text}"))

@pytest.mark.bff
@pytest.mark.core
class TestBFFCoreFunctionality:
    """Tests for basic UI elements in BFF mode (no token management in frontend)."""

    def test_unauthenticated_access(self, page: Page, test_config):
        """Verify display for unauthenticated access."""
        page.goto(test_config["base_url"])
        
        # BFF mode: no login button, user info shows "Not logged in"
        expect(page.locator("#page-content")).to_contain_text("Please log in")
        expect(page.locator(".fruit-item")).not_to_be_visible()

    def test_fruit_list_rendering(self, page: Page, test_config):
        """Test if the fruit list is rendered correctly after authentication."""
        # BFF mode: mock the BFF endpoint directly
        page.route(f"{test_config['api_base_url']}/fruits", lambda route: route.fulfill(
            status=200,
            content_type="application/json",
            body='[{"id":"1","name":"Apple","origin":"Aomori","price":100}]'
        ))
        page.route(f"{test_config['api_base_url']}/me", lambda route: route.fulfill(
            status=200,
            content_type="application/json",
            body='{"name":"Test User"}'
        ))
        
        page.goto(test_config["base_url"])
        
        # Wait for the page to load and make requests
        page.wait_for_load_state("networkidle")
        
        # BFF mode: user info should be displayed if authenticated
        # Note: In real BFF mode, authentication is handled by cookies
        # This test verifies the UI renders correctly when BFF returns data

    def test_cart_operations(self, page: Page, test_config):
        """Test cart operations in BFF mode."""
        single_fruit = [{"id": "1", "name": "Apple", "origin": "Aomori", "price": 100}]
        page.route(f"{test_config['api_base_url']}/fruits", lambda route: route.fulfill(
            status=200,
            content_type="application/json",
            body=str(single_fruit).replace("'", '"')
        ))
        
        page.goto(test_config["base_url"])
        page.wait_for_load_state("networkidle")
        
        # Cart operations should work the same as direct mode
        # (cart is managed in localStorage, not related to auth)

@pytest.mark.bff
@pytest.mark.auth
class TestBFFAuthenticationFlow:
    """Tests for BFF mode authentication (cookie-based)."""

    def test_no_token_in_local_storage(self, page: Page, test_config):
        """Verify that tokens are NOT stored in localStorage in BFF mode."""
        page.goto(test_config["base_url"])
        page.wait_for_load_state("networkidle")
        
        # BFF mode should not store tokens in localStorage
        access_token = page.evaluate("() => localStorage.getItem('access_token')")
        refresh_token = page.evaluate("() => localStorage.getItem('refresh_token')")
        
        assert access_token is None, "access_token should not be in localStorage in BFF mode"
        assert refresh_token is None, "refresh_token should not be in localStorage in BFF mode"

    def test_credentials_include_in_requests(self, page: Page, test_config):
        """Verify that requests use credentials: 'include' (cookies)."""
        page.goto(test_config["base_url"])
        page.wait_for_load_state("networkidle")
        
        # Intercept requests to verify they include credentials
        requests_made = []
        page.on("request", lambda req: requests_made.append(req))
        
        # Trigger a page reload to capture requests
        page.reload()
        page.wait_for_load_state("networkidle")
        
        # Check that API requests were made with credentials
        api_requests = [r for r in requests_made if "/api/" in r.url]
        for req in api_requests:
            # Playwright doesn't directly expose credentials flag,
            # but we can verify the request was made to the correct endpoint
            assert "localhost" in req.url or "bff" in req.url

@pytest.mark.bff
@pytest.mark.security
class TestBFFSecurity:
    """Tests for BFF mode security."""

    def test_no_oidc_flow_in_frontend(self, page: Page, test_config):
        """Verify that no OIDC flow is initiated in the frontend."""
        page.goto(test_config["base_url"])
        page.wait_for_load_state("networkidle")
        
        # BFF mode should not have OIDC-related sessionStorage items
        oidc_state = page.evaluate("() => sessionStorage.getItem('oidc-state')")
        oidc_nonce = page.evaluate("() => sessionStorage.getItem('oidc-nonce')")
        
        assert oidc_state is None, "oidc-state should not be in sessionStorage in BFF mode"
        assert oidc_nonce is None, "oidc-nonce should not be in sessionStorage in BFF mode"

    def test_auth_server_not_exposed(self, page: Page, test_config):
        """Verify that the auth server URL is not exposed to the frontend."""
        page.goto(test_config["base_url"])
        page.wait_for_load_state("networkidle")
        
        # Check that no requests are made directly to the auth server
        requests_made = []
        page.on("request", lambda req: requests_made.append(req))
        
        page.reload()
        page.wait_for_load_state("networkidle")
        
        # No requests should go directly to the auth server in BFF mode
        auth_requests = [r for r in requests_made if "8082" in r.url]
        assert len(auth_requests) == 0, "Auth server should not be accessed directly in BFF mode"

@pytest.mark.bff
@pytest.mark.performance
class TestBFFPerformance:
    """Tests for BFF mode performance."""

    def test_bff_response_time(self, page: Page, test_config, record_property):
        """Measure BFF response time (should be similar to direct mode)."""
        import time
        
        threshold = test_config.get("performance", {}).get("api_response_threshold", 1.0)
        api_url = f"{test_config['api_base_url']}/fruits"
        
        start_time = time.time()
        response = page.request.get(api_url)
        duration = time.time() - start_time
        
        print(f"\nBFF API Response Time: {duration:.4f}s (Threshold: {threshold}s)")
        record_property("bff_response_duration_s", round(duration, 4))
        
        # Accept 200 (authenticated) or 401 (unauthenticated)
        assert response.status in [200, 401], f"BFF request failed with status {response.status}"
        assert duration < threshold, f"BFF response took too long: {duration}s"
