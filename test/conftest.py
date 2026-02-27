import pytest
import yaml
import json
import os
from datetime import datetime

# A list to store test results.
test_results = []

@pytest.fixture(scope="session")
def test_config():
    """Fixture to load the YAML config file."""
    config_path = os.path.join(os.path.dirname(__file__), "test_config.yaml")
    with open(config_path, "r", encoding="utf-8") as f:
        return yaml.safe_load(f)

@pytest.fixture(scope="session")
def browser_context_args(test_config):
    """Fixture to configure Playwright browser context arguments."""
    args = {}
    ssl_config = test_config.get("ssl", {})

    # Set to ignore HTTPS errors if insecure_skip_verify is true
    if ssl_config.get("insecure_skip_verify"):
        args["ignore_https_errors"] = True

    # Override the Host header if specified
    host_header = ssl_config.get("host_header")
    if host_header:
        args["extra_http_headers"] = {"Host": host_header}

    return args

@pytest.hookimpl(tryfirst=True, hookwrapper=True)
def pytest_runtest_makereport(item, call):
    """Hook to get the result of each test execution."""
    outcome = yield
    report = outcome.get_result()

    # Record the result only for the 'call' phase (excluding setup/teardown).
    if report.when == 'call':
        result = {
            "test_name": item.name,
            "outcome": report.outcome,  # passed, failed, skipped
            "duration": round(report.duration, 4),
            "timestamp": datetime.now().isoformat(),
            "node_id": item.nodeid
        }
        if report.failed:
            # Add the error message if the test failed.
            result["error"] = report.longreprtext
        
        # Add custom properties (like performance metrics) if they exist.
        if report.user_properties:
            result["performance_metrics"] = {key: value for key, value in report.user_properties}

        test_results.append(result)

def pytest_sessionfinish(session, exitstatus):
    """Hook to write the results to a JSON file at the end of the session."""
    output_file = os.path.join(os.path.dirname(__file__), "test_results.json")
    
    summary = {
        "session_timestamp": datetime.now().isoformat(),
        "results": test_results
    }
    
    with open(output_file, "w", encoding="utf-8") as f:
        json.dump(summary, f, indent=2, ensure_ascii=False)
    
    print(f"\nTest results saved to: {output_file}")
