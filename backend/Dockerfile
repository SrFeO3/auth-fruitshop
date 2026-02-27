# ---- Builder Stage ----
# Use the official Rust image as a builder.
FROM rust:1.92-slim-bookworm AS builder

# Install git and build tools
RUN apt-get update && apt-get install -y git build-essential libpq-dev && rm -rf /var/lib/apt/lists/*

# Clone the source code from the Git repository
WORKDIR /usr/src/backend
RUN git clone https://github.com/SrFeO3/fruitshop-api.git .

# Build the application for release
RUN cargo build --release

# ---- Final Stage ----
FROM debian:bookworm-slim
RUN apt-get update && apt-get install -y ca-certificates curl && rm -rf /var/lib/apt/lists/*
COPY --from=builder /usr/src/backend/target/release/fruitshop-api /usr/local/bin/fruitshop-api

ENV SERVER_ADDRESS="0.0.0.0:5000"
ENV RUST_LOG="debug"

CMD ["fruitshop-api"]
