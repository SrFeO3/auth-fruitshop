# ---- Builder Stage ----
# Use the official Rust image as a builder.
FROM rust:1.89-slim-bookworm as builder

# Install build tools needed for some Rust crate dependencies that compile C code.
RUN apt-get update && apt-get install -y build-essential libpq-dev && rm -rf /var/lib/apt/lists/*

# Create a new empty shell project to cache and build dependencies
WORKDIR /usr/src/backend
COPY Cargo.toml Cargo.lock ./
RUN mkdir src && echo "fn main() {}" > src/main.rs
RUN cargo build --release

# Copy the source code and build for release
COPY src ./src
RUN touch src/main.rs && cargo build --release

# ---- Final Stage ----
FROM debian:bookworm-slim
RUN apt-get update && apt-get install -y ca-certificates && rm -rf /var/lib/apt/lists/*
COPY --from=builder /usr/src/backend/target/release/backend /usr/local/bin/backend
CMD ["backend"]