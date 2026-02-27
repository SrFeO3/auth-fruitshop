# =================================================================================================
# Frontend Integration Tests
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
# - Run all tests:
#    pytest
#
# - Run specific categories (markers defined in pytest.ini):
#    pytest -m core       # Basic UI/Functional tests
#    pytest -m auth       # Authentication flow tests
#    pytest -m security   # Security & Error handling tests
#
import pytest
import json
import base64
from playwright.sync_api import Page, expect

@pytest.fixture(autouse=True)
def setup(page: Page):
    """Setup executed before each test."""
    # Display browser console logs in the standard output (for debugging).
    page.on("console", lambda msg: print(f"Browser Console: {msg.text}"))

@pytest.mark.core
class TestCoreFunctionality:
    """Tests for basic UI elements and core application features (non-auth)."""

    def test_unauthenticated_access(self, page: Page, test_config):
        """Verify display for unauthenticated access."""
        page.goto(test_config["base_url"])
        
        expect(page.locator("#login-button")).to_be_visible()
        expect(page.locator("#page-content")).to_contain_text("Please log in")
        expect(page.locator("#fruit-list")).not_to_be_visible()

    def test_fruit_list_rendering(self, page: Page, test_config):
        """Test if the fruit list is rendered correctly in an authenticated state."""
        page.route(f"{test_config['api_base_url']}/fruits", lambda route: route.fulfill(
            status=200,
            content_type="application/json",
            body=json.dumps(test_config["mock_fruits"])
        ))
        page.goto(test_config["base_url"])
        page.evaluate("""() => {
            localStorage.setItem('access_token', 'mock-access-token');
            localStorage.setItem('user', JSON.stringify({name: 'Test User'}));
        }""")
        page.reload()

        expect(page.locator(".login-status")).to_contain_text("Logged in as: Test User")
        expect(page.locator(".fruit-item")).to_have_count(len(test_config["mock_fruits"]))
        
        first_fruit = test_config["mock_fruits"][0]
        expect(page.locator(".fruit-item").first).to_contain_text(first_fruit["name"])
        expect(page.locator(".fruit-item").first).to_contain_text(f"{first_fruit['price']} yen")

    def test_cart_operations(self, page: Page, test_config):
        """Test cart addition and calculation logic."""
        single_fruit = [test_config["mock_fruits"][0]]
        page.route(f"{test_config['api_base_url']}/fruits", lambda route: route.fulfill(
            status=200,
            content_type="application/json",
            body=json.dumps(single_fruit)
        ))
        page.goto(test_config["base_url"])
        page.evaluate("""() => {
            localStorage.setItem('access_token', 'mock-token');
            localStorage.setItem('user', JSON.stringify({name: 'Test User'}));
        }""")
        page.reload()

        page.locator(".add-to-cart-button").click()
        expect(page.locator("#cart-controls")).to_contain_text("Cart (1)")

        page.locator("#cart-controls a").click()
        expect(page.locator(".cart-item")).to_have_count(1)
        
        expected_price = single_fruit[0]["price"]
        expect(page.locator(".cart-summary")).to_contain_text(f"Total: {expected_price} yen")

        page.locator("button[data-change='1']").click()
        expect(page.locator(".cart-item span")).to_have_text("2")
        expect(page.locator(".cart-summary")).to_contain_text(f"Total: {expected_price * 2} yen")

        page.reload()
        expect(page.locator(".cart-summary")).to_contain_text(f"Total: {expected_price * 2} yen")

@pytest.mark.auth
class TestAuthenticationFlow:
    """Tests for the standard OIDC authentication and token handling flows."""

    def test_login_redirect(self, page: Page, test_config):
        """Verify redirection to the OIDC provider when the login button is clicked."""
        page.goto(test_config["base_url"])
        with page.expect_navigation(url=lambda url: test_config["oidc_provider_url"] in url):
            page.locator("#login-button").click()

    def test_token_refresh_failure_and_logout(self, page: Page, test_config):
        """Verify app logs out user if token refresh fails."""
        scheme = "https" if test_config.get("ssl", {}).get("use_ssl") else "http"
        page.route(f"{test_config['api_base_url']}/fruits", lambda route: route.fulfill(status=401))
        page.route(f"{scheme}://{test_config['oidc_provider_url']}/api/token", lambda route: route.fulfill(status=401))
        page.goto(test_config["base_url"])
        page.evaluate("""() => {
            localStorage.setItem('access_token', 'fake-expired-access-token');
            localStorage.setItem('refresh_token', 'fake-invalid-refresh-token');
            localStorage.setItem('user', JSON.stringify({name: 'Test User'}));
        }""")
        page.reload()

        expect(page.locator("#login-button")).to_be_visible(timeout=10000)
        expect(page.locator("#page-content")).to_contain_text("Please log in")
        expect(page.locator(".login-status")).to_contain_text("Not logged in")
        assert page.evaluate("() => localStorage.getItem('access_token')") is None

@pytest.mark.security
class TestOIDCErrorHandlingAndSecurity:
    """Tests for security, protocol correctness, and error handling in the OIDC flow."""

    def test_auth_callback_with_error(self, page: Page, test_config):
        """Verify app handles an error from the OIDC provider during callback."""
        error_url = f"{test_config['base_url']}?error=access_denied&error_description=User-denied-login"
        page.goto(error_url)
        expect(page.locator("#page-content")).to_contain_text("Please log in")
        expect(page.locator("#login-button")).to_be_visible()
        expect(page.locator(".login-status")).to_contain_text("Not logged in")

    def test_auth_callback_with_state_mismatch(self, page: Page, test_config):
        """Verify app rejects login with a mismatched state (CSRF protection)."""
        page.goto(test_config["base_url"])
        page.evaluate("() => sessionStorage.setItem('oidc-state', 'expected-state-for-csrf-test')")
        mismatch_url = f"{test_config['base_url']}?code=some-fake-code&state=mismatched-state"
        page.goto(mismatch_url)
        expect(page.locator("#page-content")).to_contain_text("Authentication failed due to invalid state")
        expect(page.locator("#login-button")).to_be_visible()

    def test_oidc_flow_anomalies(self, page: Page, test_config):
        """Verify frontend handling of various OIDC flow irregularities."""
        base_url = test_config["base_url"]
        oidc_url = test_config["oidc_provider_url"]
        scheme = "https" if test_config.get("ssl", {}).get("use_ssl") else "http"

        def check_callback_failure(params, expected_text="Authentication failed"):
            page.goto(base_url)
            if 'state' in params:
                 page.evaluate(f"() => sessionStorage.setItem('oidc-state', '{params['state']}')")
            query = "&".join([f"{k}={v}" for k, v in params.items()])
            page.goto(f"{base_url}?{query}")
            expect(page.locator("#page-content")).to_contain_text(expected_text)
            expect(page.locator(".login-status")).to_contain_text("Not logged in")

        # Test various callback and token exchange failures
        check_callback_failure({"code": "valid-code"}, "Please log in")
        check_callback_failure({"state": "valid-state"}, "Please log in")
        check_callback_failure({"error": "server_error"}, "Please log in")

        token_endpoint = f"{scheme}://{oidc_url}/api/token"
        valid_params = {"code": "valid-code", "state": "valid-state"}
        page.route(token_endpoint, lambda route: route.fulfill(status=400))
        check_callback_failure(valid_params, "Authentication failed")

        page.route(token_endpoint, lambda route: route.fulfill(status=500))
        check_callback_failure(valid_params, "Authentication failed")

        page.route(token_endpoint, lambda route: route.fulfill(status=200, body=json.dumps({"foo": "bar"})))
        page.goto(base_url)
        page.evaluate(f"() => sessionStorage.setItem('oidc-state', '{valid_params['state']}')")
        page.goto(f"{base_url}?code={valid_params['code']}&state={valid_params['state']}")
        expect(page.locator(".login-status")).to_contain_text("Not logged in")

    def test_auth_callback_with_nonce_mismatch(self, page: Page, test_config):
        """Verify app rejects login if the ID token nonce does not match."""
        base_url, oidc_url = test_config["base_url"], test_config["oidc_provider_url"]
        scheme = "https" if test_config.get("ssl", {}).get("use_ssl") else "http"
        
        page.goto(base_url)
        page.evaluate("""() => {
            sessionStorage.setItem('oidc-state', 'valid-state');
            sessionStorage.setItem('oidc-nonce', 'expected-nonce');
        }""")

        def create_fake_jwt(payload):
            header = base64.urlsafe_b64encode(json.dumps({"alg": "none"}).encode()).decode().rstrip("=")
            payload_str = base64.urlsafe_b64encode(json.dumps(payload).encode()).decode().rstrip("=")
            return f"{header}.{payload_str}.signature"

        wrong_nonce_token = create_fake_jwt({"nonce": "wrong-nonce", "iss": f"{scheme}://{oidc_url}", "aud": "fruit-shop"})
        page.route(f"{scheme}://{oidc_url}/api/token", lambda route: route.fulfill(
            status=200,
            body=json.dumps({"access_token": "fake-token", "id_token": wrong_nonce_token})
        ))

        page.goto(f"{base_url}?code=valid-code&state=valid-state")
        expect(page.locator("#login-button")).to_be_visible()
        expect(page.locator(".login-status")).to_contain_text("Not logged in")

    def test_token_exchange_client_auth_method(self, page: Page, test_config):
        """Verify client_id is sent via Basic Auth, not in the request body."""
        base_url, oidc_url = test_config["base_url"], test_config["oidc_provider_url"]
        scheme = "https" if test_config.get("ssl", {}).get("use_ssl") else "http"
        client_id, client_secret = "fruit-shop", "fruit-shop-secret"
        token_endpoint = f"{scheme}://{oidc_url}/api/token"

        page.goto(base_url)
        page.evaluate("""() => {
            sessionStorage.setItem('oidc-state', 'valid-state');
            sessionStorage.setItem('oidc-nonce', 'some-nonce');
            sessionStorage.setItem('oidc-code-verifier', 'some-verifier');
        }""")

        with page.expect_request(token_endpoint) as request_info:
            page.goto(f"{base_url}?code=valid-code&state=valid-state")

        request = request_info.value
        auth_header = request.headers.get('authorization')
        post_data_params = dict(x.split('=') for x in (request.post_data or "").split('&'))

        assert "client_id" not in post_data_params, "client_id should not be in the request body."
        assert auth_header is not None, "Authorization header should be present."
        
        expected_auth = f"Basic {base64.b64encode(f'{client_id}:{client_secret}'.encode()).decode()}"
        assert auth_header == expected_auth, "Authorization header value mismatch."
        assert post_data_params.get("grant_type") == "authorization_code"

@pytest.mark.security
class TestBackendAPISecurity:
    """Tests that directly probe the backend API for security vulnerabilities."""

    def test_backend_api_security_patterns(self, page: Page, test_config):
        """Verify that the Backend API rejects various unauthorized requests."""
        api = page.request
        base = test_config['api_base_url']
        
        # Test various invalid authorization attempts
        assert api.get(f"{base}/fruits").status == 401
        assert api.get(f"{base}/fruits", headers={"Authorization": ""}).status == 401
        assert api.get(f"{base}/fruits", headers={"Authorization": "Bearer "}).status == 401
        assert api.get(f"{base}/fruits", headers={"Authorization": "Bearer invalid-token"}).status == 401
        assert api.get(f"{base}/fruits", headers={"Authorization": "Basic dXNlcjpwYXNz"}).status == 401
        assert api.get(f"{base}/fruits/1").status == 401
        assert api.get(f"{base}/fruits/1", headers={"Authorization": "Bearer bad-token"}).status == 401
        assert api.post(f"{base}/fruits", headers={"Authorization": "Bearer bad-token"}).status in [401, 405]
        assert api.put(f"{base}/fruits/1", headers={"Authorization": "Bearer bad-token"}).status in [401, 405]
        assert api.delete(f"{base}/fruits/1", headers={"Authorization": "Bearer bad-token"}).status in [401, 405]
