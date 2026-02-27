# --- Stage 1: Build the application ---
FROM rust:1.92-bookworm AS builder

# Install git
RUN apt-get update && apt-get install -y git && rm -rf /var/lib/apt/lists/*

# Clone the source code from the Git repository
WORKDIR /usr/src/auth-server
RUN git clone https://github.com/SrFeO3/rudoidc.git .

# Build dependencies first to leverage cache 
RUN cargo build --release

# --- Stage 2: Create the final, minimal image ---
FROM debian:bookworm-slim

RUN apt-get update && apt-get -y install curl && rm -rf /var/lib/apt/lists/*
COPY --from=builder /usr/src/auth-server/target/release/rudoidc /usr/local/bin/rudoidc
COPY config.yaml /usr/local/bin/conf/config.yaml

WORKDIR /usr/local/bin
ENV RUST_LOG=info

CMD ["/usr/local/bin/rudoidc"]
