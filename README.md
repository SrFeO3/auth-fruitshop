# Auth Fruit Shop

A demonstration project showcasing two authentication architectures for a fruit shop SPA:

- **Direct Mode** — OIDC PKCE flow handled entirely in the frontend JavaScript
- **BFF Mode** — Backend-for-Frontend (Rust) handles authentication via cookies, keeping secrets server-side

## Directory Structure

```
auth-fruitshop/
├── .github/workflows/
│   └── release.yml              # GitHub Actions: builds & pushes container images
├── db/                          # PostgreSQL database (shared)
├── authserver/                  # OIDC auth server (shared)
├── api-backend/                 # Fruit shop API backend (Rust)
│   ├── src/main.rs
│   ├── Cargo.toml
│   ├── Cargo.lock
│   └── Dockerfile
├── bff/                         # BFF Rust service (BFF mode only)
│   ├── src/main.rs
│   ├── Cargo.toml
│   ├── Cargo.lock
│   └── Dockerfile
├── frontend/
│   ├── common/                  # Shared frontend assets
│   │   ├── index.html           # Root page (hello world)
│   │   ├── seq.html
│   │   ├── favicon.ico
│   │   ├── images/
│   │   └── shop/                # SPA directory
│   │       ├── index.html       # SPA entry point (/shop/)
│   │       └── style.css
│   ├── app-direct.js            # Direct mode: full OIDC PKCE in frontend
│   └── app-bff.js               # BFF mode: simple credentials: 'include'
├── docker-compose.direct.yml    # Direct mode
├── docker-compose.bff.yml       # BFF mode
├── test/                        # Integration tests
└── README.md
```

## Container Images

Pre-built container images are published to GitHub Container Registry:

- `ghcr.io/srfeo3/auth-fruitshop/fruitshop-api` — Fruit shop API backend
- `ghcr.io/srfeo3/auth-fruitshop/fruitshop-bff` — BFF service

Images are automatically built and pushed on push to `main` branch or version tags (`v*`).

## Architecture Comparison

### Direct Mode (`docker-compose.direct.yml`)

```
Browser ──OIDC PKCE──▶ Auth Server
   │
   ├──▶ Backend API (fruitshop-api, port 5001)
   │       └──▶ PostgreSQL
   │
   └──▶ Frontend (nginx, port 8080)
```

- The frontend handles the entire OIDC authorization code flow with PKCE
- Access tokens are stored in `localStorage` and sent via `Authorization: Bearer` headers
- Refresh tokens are used for silent token renewal
- The backend validates JWTs using JWKS from the auth server

### BFF Mode (`docker-compose.bff.yml`)

```
Browser ──cookie──▶ BFF (Rust, port 5001)
   │                     │
   │                     ├──▶ api-backend (port 5002)
   │                     │         └──▶ PostgreSQL
   │                     └──▶ Auth Server (JWKS fetch)
   │
   └──▶ Frontend (nginx, port 8080)
```

- The frontend is a simple SPA with no auth logic — all requests use `credentials: 'include'`
- The BFF handles authentication (JWT validation) and proxies requests to the api-backend
- The api-backend handles data access and database queries
- Tokens never leave the server; the browser only holds session cookies
- The BFF validates JWTs against the auth server's JWKS endpoint

## Quick Start

### Direct Mode

```bash
docker compose -f docker-compose.direct.yml up --build
```

- Frontend: http://localhost:8080
- Backend API: http://localhost:5001
- Auth Server: http://localhost:8082
- Database: localhost:5432

### BFF Mode

```bash
docker compose -f docker-compose.bff.yml up --build
```

- Frontend: http://localhost:8080
- BFF Service: http://localhost:5001
- api-backend: http://localhost:5002
- Auth Server: http://localhost:8082
- Database: localhost:5432

### Building Locally (Optional)

The `--build` flag is needed for `db` and `authserver` services which are built locally. The `api-backend` and `bff` services use pre-built images from GitHub Container Registry.

If you want to build all images locally instead of pulling from GitHub:

```bash
# Update docker-compose files to use local builds
# Change image: ghcr.io/... to build: ./api-backend (or ./bff)

# Then run
docker compose -f docker-compose.direct.yml up --build
```

## Test Users

| Username | Password | Name |
|----------|----------|------|
| suzuki | password | Taro Suzuki |
| tanaka | password2 | Hanako Tanaka |

## Services

### `db/`
PostgreSQL 14 database with `supervisord`. Initialized with `init.sql` containing sample fruit data.

### `authserver/`
OIDC authorization server built from [rudoidc](https://github.com/SrFeO3/rudoidc). Configured via `config.yaml` with test users, clients, and service accounts.

### `api-backend/`
A Rust API server (Axum) that provides fruit data endpoints with JWT validation. Source code from [fruitshop-api](https://github.com/SrFeO3/fruitshop-api).

### `bff/`
A Rust BFF service (built with Axum) that:
- Acts as an authentication proxy between the frontend and api-backend
- Validates JWTs using JWKS fetched from the auth server
- Forwards authenticated requests to the api-backend
- Handles CORS configuration

### `frontend/`
Nginx-served SPA. The shared `common/` directory is mounted as the nginx root. The mode-specific `app.js` and shared `style.css` are mounted into `shop/` via Docker volumes. The URL structure (`/shop/`) is preserved from the original setup.

### `test/`
Integration tests (pytest) for the direct mode frontend.

## Configuration

### Environment Variables

| Variable | Description | Example |
|----------|-------------|--------|
| `DATABASE_URL` | PostgreSQL connection string | `postgres://user:password@db:5432/fruitdb` |
| `API_BACKEND_URL` | Backend API URL (BFF mode only) | `http://api-backend:5000` |
| `OIDC_ISSUER_URL_INTERNAL` | Internal auth server URL (Docker network) | `http://authserver:8082` |
| `OIDC_ISSUER_URL_EXTERNAL` | External auth server URL (JWT validation) | `https://auth.wgd.example.com:8000` |
| `CORS_ALLOWED_ORIGINS` | Comma-separated allowed origins | `http://localhost:8080` |

### Auth Server Configuration

See `authserver/config.yaml` for:
- User accounts and credentials
- OIDC client definitions (redirect URIs, scopes, token lifetimes)
- Service account credentials for backend-to-authserver communication
