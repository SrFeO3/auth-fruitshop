//! # Fruit Shop BFF (Backend For Frontend)
//!
//! This BFF acts as an authentication proxy between the frontend and the api-backend.
//! It handles JWT validation and forwards authenticated requests to the backend API.
//!
//! ## Architecture
//! - Browser → BFF (authentication + API proxy)
//! - BFF → api-backend (forward authenticated requests)
//! - api-backend → PostgreSQL (data access)

use axum::{
    extract::{Request, State},
    http::{self, header, StatusCode},
    middleware::{self, Next},
    response::{IntoResponse, Response},
    routing::get,
    Router,
};
use jsonwebtoken::{decode, decode_header, DecodingKey, Validation};
use serde::Deserialize;
use std::{collections::HashMap, net::SocketAddr, sync::Arc};
use tokio::sync::RwLock;
use tower_http::cors::{Any, CorsLayer};
use tracing::{error, info, warn};
use tracing_subscriber::{layer::SubscriberExt, util::SubscriberInitExt};

/// A custom error type to handle various error kinds in the application.
#[derive(Debug, thiserror::Error)]
enum AppError {
    #[error("JWT error: {0}")]
    Jwt(#[from] jsonwebtoken::errors::Error),
    #[error("Request error: {0}")]
    Reqwest(#[from] reqwest::Error),
    #[error("Authentication failed: {0}")]
    Auth(String),
    #[error("Bad gateway: {0}")]
    BadGateway(String),
}

/// Converts our custom AppError into an HTTP response.
impl IntoResponse for AppError {
    fn into_response(self) -> Response {
        let (status, message) = match &self {
            AppError::Auth(msg) => (StatusCode::UNAUTHORIZED, msg.clone()),
            AppError::Jwt(err) => (
                StatusCode::UNAUTHORIZED,
                format!("JWT Error: {:?}", err.kind()),
            ),
            AppError::Reqwest(err) => (
                StatusCode::BAD_GATEWAY,
                format!("Backend request error: {}", err),
            ),
            AppError::BadGateway(msg) => (StatusCode::BAD_GATEWAY, msg.clone()),
        };
        error!("Responding with error: status={}, message='{}'", status, message);
        (status, message).into_response()
    }
}

/// Represents the claims we expect in the JWT.
#[derive(Debug, Deserialize)]
#[allow(dead_code)]
struct Claims {
    iss: String,
    aud: String,
    sub: String,
    exp: usize,
    iat: Option<usize>,
    jti: Option<String>,
    scope: Option<String>,
    client_id: Option<String>,
}

/// Represents the structure of the JWKS response from the auth server.
#[derive(Debug, Deserialize)]
struct Jwks {
    keys: Vec<JwkKey>,
}

#[derive(Debug, Deserialize)]
#[allow(dead_code)]
struct JwkKey {
    kty: String,
    kid: String,
    n: String,
    e: String,
    alg: String,
    #[serde(rename = "use")]
    key_use: String,
}

/// A client to fetch and cache JWKS keys.
struct JwksClient {
    jwks_uri: String,
    keys: RwLock<HashMap<String, DecodingKey>>,
    http_client: reqwest::Client,
}

impl JwksClient {
    fn new(jwks_uri: &str) -> Self {
        Self {
            jwks_uri: jwks_uri.to_string(),
            keys: RwLock::new(HashMap::new()),
            http_client: reqwest::Client::new(),
        }
    }

    /// Gets a decoding key by its ID (kid). Fetches and caches if not present.
    async fn get_decoding_key(&self, kid: &str) -> Result<DecodingKey, AppError> {
        // First, check if the key is already in our cache.
        if let Some(key) = self.keys.read().await.get(kid) {
            info!("JWKS Client: Found key with kid '{}' in cache.", kid);
            return Ok(key.clone());
        }

        // If not in cache, fetch the entire JWKS from the auth server.
        info!("JWKS Client: Key with kid '{}' not in cache. Fetching JWKS.", kid);
        let jwks: Jwks = self.http_client.get(&self.jwks_uri).send().await?.json().await?;
        info!("JWKS Client: Successfully fetched {} keys.", jwks.keys.len());

        // Write the fetched keys to the cache.
        let mut key_map = self.keys.write().await;
        key_map.clear();

        for key in jwks.keys {
            if key.kty == "RSA" && key.key_use == "sig" {
                let decoding_key = DecodingKey::from_rsa_components(&key.n, &key.e)?;
                key_map.insert(key.kid.clone(), decoding_key);
            }
        }
        info!("JWKS Client: Cache updated with new keys.");

        // Try to get the key from the now-populated cache.
        if let Some(key) = key_map.get(kid) {
            info!("JWKS Client: Successfully retrieved new key with kid '{}'.", kid);
            Ok(key.clone())
        } else {
            Err(AppError::Auth(format!("Unknown key ID '{}'", kid)))
        }
    }
}

/// The shared application state.
#[derive(Clone)]
struct AppState {
    api_backend_url: String,
    jwks_client: Arc<JwksClient>,
    jwt_validation: Arc<Validation>,
}

/// Axum middleware for JWT authentication.
///
/// This middleware intercepts requests to protected routes and validates JWTs.
/// For OPTIONS requests, it bypasses authentication to handle CORS preflight.
async fn auth_middleware(State(state): State<AppState>, request: Request, next: Next) -> Result<Response, AppError> {
    // 1. CORS Preflight Handling:
    if request.method() == http::Method::OPTIONS {
        info!("Auth middleware: Handling CORS preflight request (OPTIONS)");
        return Ok(Response::builder().status(StatusCode::OK).body(Default::default()).unwrap());
    }

    // 2. Extract JWT Token
    let auth_header = request.headers().get(header::AUTHORIZATION).and_then(|h| h.to_str().ok());
    let token = auth_header
        .and_then(|h| h.strip_prefix("Bearer "))
        .ok_or_else(|| {
            warn!("Auth middleware: Missing or invalid Bearer token");
            AppError::Auth("Missing or invalid Bearer token".to_string())
        })?;

    info!("Auth middleware: Validating token...");

    // 3. Fetch Validation Key
    let header = decode_header(token)?;
    let kid = header.kid.ok_or_else(|| AppError::Auth("Token missing 'kid' in header".to_string()))?;
    info!("Auth middleware: Found token with kid '{}'", kid);

    let decoding_key = state.jwks_client.get_decoding_key(&kid).await?;

    // 4. Validate Claims
    let token_data = decode::<Claims>(token, &decoding_key, &state.jwt_validation)?;
    info!("Auth middleware: Token validated successfully with claims: {:?}", token_data.claims);

    // 5. Pass to Next Handler
    Ok(next.run(request).await)
}

/// Handler for the root endpoint.
async fn root_handler() -> &'static str {
    "BFF is running!"
}

/// Proxy handler that forwards requests to the api-backend.
///
/// This handler takes any request path and forwards it to the api-backend,
/// preserving the HTTP method, headers, and body.
async fn proxy_handler(
    State(state): State<AppState>,
    request: Request,
) -> Result<Response, AppError> {
    let path = request.uri().path();
    let query = request.uri().query().map(|q| format!("?{}", q)).unwrap_or_default();
    let method = request.method().clone();

    // Build the target URL
    let target_url = format!("{}{}{}", state.api_backend_url, path, query);
    info!("Proxy: Forwarding {} {} to {}", method, path, target_url);

    // Extract request headers
    let mut headers = http::HeaderMap::new();
    for (key, value) in request.headers().iter() {
        // Skip hop-by-hop headers
        if key == header::HOST || key == header::CONNECTION {
            continue;
        }
        headers.insert(key.clone(), value.clone());
    }

    // Extract request body
    let body = axum::body::to_bytes(request.into_body(), usize::MAX)
        .await
        .map_err(|e| AppError::BadGateway(format!("Failed to read request body: {}", e)))?;

    // Forward the request to the api-backend
    let client = reqwest::Client::new();
    let mut backend_request = client.request(method, &target_url);

    // Copy headers
    for (key, value) in headers.iter() {
        if let Some(name) = key.as_str().parse::<reqwest::header::HeaderName>().ok() {
            backend_request = backend_request.header(name, value.as_bytes());
        }
    }

    // Send the request with body
    let response = backend_request
        .body(body)
        .send()
        .await
        .map_err(|e| {
            error!("Proxy: Failed to forward request to backend: {}", e);
            AppError::Reqwest(e)
        })?;

    // Build the response to return to the client
    let status = response.status();
    let response_headers = response.headers().clone();
    let response_body = response.bytes().await?;

    info!("Proxy: Received response with status {}", status);

    // Create the response
    let mut response_builder = Response::builder().status(status.as_u16());

    // Copy response headers (excluding hop-by-hop headers)
    for (key, value) in response_headers.iter() {
        if key == header::TRANSFER_ENCODING || key == header::CONNECTION {
            continue;
        }
        response_builder = response_builder.header(key, value);
    }

    response_builder
        .body(axum::body::Body::from(response_body))
        .map_err(|e| AppError::BadGateway(format!("Failed to build response: {}", e)))
}

#[tokio::main]
async fn main() -> Result<(), Box<dyn std::error::Error>> {
    // Load environment variables from .env file if it exists.
    dotenvy::dotenv().ok();

    // Setup tracing subscriber for logging.
    let rust_log = std::env::var("RUST_LOG").unwrap_or_else(|_| "info,tower_http=debug".into());
    tracing_subscriber::registry()
        .with(tracing_subscriber::EnvFilter::new(&rust_log))
        .with(tracing_subscriber::fmt::layer())
        .init();

    // --- Configuration ---
    let api_backend_url = std::env::var("API_BACKEND_URL").expect("API_BACKEND_URL must be set");
    let oidc_issuer_internal = std::env::var("OIDC_ISSUER_URL_INTERNAL").expect("OIDC_ISSUER_URL_INTERNAL must be set");
    let oidc_issuer_external = std::env::var("OIDC_ISSUER_URL_EXTERNAL").expect("OIDC_ISSUER_URL_EXTERNAL must be set");
    let allowed_origins_str = std::env::var("CORS_ALLOWED_ORIGINS").expect("CORS_ALLOWED_ORIGINS must be set");
    let jwks_uri = format!("{}/jwks.json", oidc_issuer_internal);

    info!("--- Application Configuration ---");
    info!("API_BACKEND_URL: {}", api_backend_url);
    info!("OIDC_ISSUER_URL_INTERNAL: {}", oidc_issuer_internal);
    info!("OIDC_ISSUER_URL_EXTERNAL: {}", oidc_issuer_external);
    info!("CORS_ALLOWED_ORIGINS: {}", allowed_origins_str);
    info!("JWKS URI: {}", jwks_uri);
    info!("---------------------------------");

    // Parse CORS allowed origins
    let allowed_origins: Vec<http::HeaderValue> = allowed_origins_str
        .split(',')
        .filter_map(|s| s.trim().parse().ok())
        .collect();

    // Setup CORS layer
    let cors = CorsLayer::new()
        .allow_origin(allowed_origins)
        .allow_methods(Any)
        .allow_headers(Any)
        .allow_credentials(true);

    // Setup JWKS client for token validation
    let jwks_client = Arc::new(JwksClient::new(&jwks_uri));

    // Setup JWT validation
    let mut validation = Validation::default();
    validation.set_audience(&["fruit-shop"]);
    validation.set_issuer(&[oidc_issuer_external.clone()]);
    validation.validate_exp = true;
    let jwt_validation = Arc::new(validation);

    // Create shared application state
    let state = AppState {
        api_backend_url,
        jwks_client,
        jwt_validation,
    };

    // Build the application router
    let app = Router::new()
        .route("/", get(root_handler))
        .route("/api/fruits", get(proxy_handler))
        .route("/api/fruits/{*fruit_id}", get(proxy_handler))
        .route("/shop/api/me", get(proxy_handler))
        .layer(middleware::from_fn_with_state(state.clone(), auth_middleware))
        .layer(cors)
        .with_state(state);

    // Start the server
    let addr = SocketAddr::from(([0, 0, 0, 0], 5000));
    info!("BFF server listening on {}", addr);

    let listener = tokio::net::TcpListener::bind(addr).await?;
    axum::serve(listener, app).await?;

    Ok(())
}
