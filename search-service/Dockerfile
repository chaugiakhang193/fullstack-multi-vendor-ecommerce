# syntax=docker/dockerfile:1

# ---- Build stage --------------------------------------------------------
FROM golang:1.26-bookworm AS builder
WORKDIR /src

# Copy manifest truoc roi moi copy source: layer `go mod download` chi invalidate
# khi go.mod/go.sum doi, khong phai moi lan sua 1 dong Go.
COPY go.mod go.sum ./
RUN go mod download

COPY . .

# CGO_ENABLED=0: bat buoc de chay tren distroless/static (khong co libc). pgx va
# amqp091 deu pure Go nen khong mat tinh nang gi.
# -trimpath: bo duong dan tuyet doi cua may build khoi binary (build reproducible).
# -ldflags "-s -w": bo symbol table + DWARF, nho hon vai MB.
RUN CGO_ENABLED=0 GOOS=linux go build -trimpath -ldflags="-s -w" -o /out/search-service ./cmd/server

# ---- Runtime stage ------------------------------------------------------
# distroless/static: chi co ca-certificates + tzdata + user nonroot, khong shell,
# khong package manager. ca-certificates la thu BAT BUOC o day — thieu no thi ca
# Neon (sslmode=require) lan CloudAMQP (amqps://) deu gay TLS handshake.
FROM gcr.io/distroless/static-debian12:nonroot

COPY --from=builder /out/search-service /search-service

# Render se ghi de bang PORT tiem vao; 8090 chi la mac dinh cho docker run local.
EXPOSE 8090
USER nonroot:nonroot

# ENTRYPOINT (khong phai CMD) vi binary khong nhan sub-command; migration chay
# ngay trong main() qua index.RunMigrations nen khong can wrapper shell — va
# distroless cung khong co shell de chay.
ENTRYPOINT ["/search-service"]
