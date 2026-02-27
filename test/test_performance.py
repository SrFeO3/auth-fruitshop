import pytest
import time
from playwright.sync_api import Page, APIRequestContext

@pytest.mark.performance
class TestPerformance:
    """Tests for measuring application performance."""

    def test_page_load_performance(self, page: Page, test_config, record_property):
        """
        Measure the page load time (Navigation Timing).
        Verifies that the main page loads within the configured threshold.
        """
        threshold = test_config.get("performance", {}).get("page_load_threshold", 2.0)
        
        start_time = time.time()
        page.goto(test_config["base_url"])
        
        # Wait for a key element to ensure the page is actually usable (First Meaningful Paint equivalent)
        page.locator("#login-button").wait_for()
        
        duration = time.time() - start_time
        print(f"\nPage Load Time: {duration:.4f}s (Threshold: {threshold}s)")
        record_property("page_load_duration_s", round(duration, 4))
        
        # Get detailed Navigation Timing metrics from the browser for debugging/logging
        timing = page.evaluate("() => window.performance.timing.toJSON()")
        load_event_end = timing["loadEventEnd"]
        navigation_start = timing["navigationStart"]
        
        if load_event_end > 0:
            browser_load_time = (load_event_end - navigation_start) / 1000.0
            print(f"Browser Reported Load Time (Navigation Timing API): {browser_load_time:.4f}s")

        assert duration < threshold, f"Page load took too long: {duration}s"

    def test_api_response_time(self, page: Page, test_config, record_property):
        """
        Measure the response time of the backend API.
        This tests the actual network/backend latency without frontend rendering overhead.
        """
        threshold = test_config.get("performance", {}).get("api_response_threshold", 1.0)
        api_url = f"{test_config['api_base_url']}/fruits"
        api: APIRequestContext = page.request
        
        start_time = time.time()
        # Use the APIRequestContext to make the request directly
        response = api.get(api_url)
        duration = time.time() - start_time
        
        print(f"\nAPI Response Time ({api_url}): {duration:.4f}s (Threshold: {threshold}s)")
        record_property("api_response_duration_s", round(duration, 4))
        
        # We expect 200 (if backend is running) or 401 (if auth is required but backend is running)
        assert response.status in [200, 401], f"API request failed with status {response.status}"
        assert duration < threshold, f"API response took too long: {duration}s"

    def test_concurrent_api_load(self, test_config, record_property):
        """
        Perform a simple load test on the API using concurrent requests.
        Simulates multiple users accessing the API simultaneously.
        """
        import concurrent.futures
        import urllib.request
        import urllib.error
        import ssl

        load_config = test_config.get("performance", {}).get("load_test", {})
        concurrency = load_config.get("concurrency", 10)
        total_requests = load_config.get("total_requests", 50)
        threshold = load_config.get("threshold_avg_time", 1.0)
        
        api_url = f"{test_config['api_base_url']}/fruits"
        
        # Configure SSL context if verification skip is requested
        ssl_context = None
        if test_config.get("ssl", {}).get("insecure_skip_verify"):
            ssl_context = ssl.create_default_context()
            ssl_context.check_hostname = False
            ssl_context.verify_mode = ssl.CERT_NONE

        print(f"\nStarting Load Test: {total_requests} requests with {concurrency} concurrency against {api_url}")
        
        times = []
        errors = 0
        
        def make_request():
            start = time.time()
            try:
                # Set a timeout to avoid hanging indefinitely
                with urllib.request.urlopen(api_url, timeout=5, context=ssl_context) as response:
                    response.read() # Ensure body is read
                    return time.time() - start, response.getcode()
            except urllib.error.HTTPError as e:
                return time.time() - start, e.code
            except Exception as e:
                return time.time() - start, str(e)

        start_load_test = time.time()
        
        with concurrent.futures.ThreadPoolExecutor(max_workers=concurrency) as executor:
            futures = [executor.submit(make_request) for _ in range(total_requests)]
            for future in concurrent.futures.as_completed(futures):
                duration, status = future.result()
                times.append(duration)
                
                # 200 (OK) and 401 (Unauthorized) are valid server responses for load testing availability
                if isinstance(status, int):
                    if status not in [200, 401]:
                        errors += 1
                else:
                    errors += 1

        total_time = time.time() - start_load_test
        avg_time = sum(times) / len(times) if times else 0
        rps = len(times) / total_time if total_time > 0 else 0
        
        print(f"Load Test: {total_time:.4f}s total, Avg: {avg_time:.4f}s, RPS: {rps:.2f}, Errors: {errors}")
        
        record_property("load_test_avg_time_s", round(avg_time, 4))
        record_property("load_test_rps", round(rps, 2))
        
        assert errors == 0, f"Load test had {errors} errors"
        assert avg_time < threshold, f"Average response time {avg_time:.4f}s exceeded threshold {threshold}s"
