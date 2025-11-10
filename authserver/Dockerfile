# --- Stage 1: Build the application ---
FROM rust:1.89-bookworm as builder

# Install git
RUN apt-get update && apt-get install -y git && rm -rf /var/lib/apt/lists/*

# Clone the source code from the Git repository
WORKDIR /usr/src/auth-server
RUN git clone https://github.com/SrFeO3/rudoidc.git .

# Build dependencies first to leverage cache
RUN cargo build --release

# Build the application
# (Source code is already cloned, so just build again)
RUN cargo build --release

# --- Stage 2: Create the final, minimal image ---
FROM debian:bookworm-slim

COPY --from=builder /usr/src/auth-server/target/release/rudoidc /usr/local/bin/rudoidc

CMD ["/usr/local/bin/rudoidc"]