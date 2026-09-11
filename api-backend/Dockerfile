# ---- Builder Stage ----
FROM rust:1.92-slim-bookworm AS builder

# Install build tools needed for some Rust crate dependencies that compile C code.
RUN apt-get update && apt-get install -y build-essential libpq-dev && rm -rf /var/lib/apt/lists/*

# Create a new empty shell project to cache and build dependencies
WORKDIR /usr/src/fruitshop-api
COPY Cargo.toml Cargo.lock ./
RUN mkdir src && echo "fn main() {}" > src/main.rs
RUN cargo build --release

# Copy the source code and build for release
COPY src ./src
RUN touch src/main.rs && cargo build --release

# ---- Final Stage ----
FROM debian:bookworm-slim
RUN apt-get update && apt-get install -y ca-certificates curl && rm -rf /var/lib/apt/lists/*
COPY --from=builder /usr/src/fruitshop-api/target/release/fruitshop-api /usr/local/bin/fruitshop-api

ENV SERVER_ADDRESS="0.0.0.0:5000"
ENV RUST_LOG="debug"

CMD ["fruitshop-api"]
