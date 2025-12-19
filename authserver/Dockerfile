# --- Stage 1: Build the application ---
FROM rust:1.91-bookworm as builder

# Install git
RUN apt-get update && apt-get install -y git && rm -rf /var/lib/apt/lists/*

# Clone the source code from the Git repository
WORKDIR /usr/src/auth-server
# On subsequent builds, pull the latest changes. If the clone doesn't exist, clone it.
# This ensures we always build against the latest code from the main branch.
RUN git clone https://github.com/SrFeO3/rudoidc.git . || git pull
 
# Build the application.
# Cargo will automatically handle dependencies and only recompile what's necessary.
RUN cargo build --release

# --- Stage 2: Create the final, minimal image ---
FROM debian:bookworm-slim

COPY --from=builder /usr/src/auth-server/target/release/rudoidc /usr/local/bin/rudoidc

CMD ["/usr/local/bin/rudoidc"]