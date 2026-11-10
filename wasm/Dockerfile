FROM rust:1-bookworm
RUN rustup target add wasm32-unknown-unknown && cargo install wasm-pack --locked
WORKDIR /workspace
