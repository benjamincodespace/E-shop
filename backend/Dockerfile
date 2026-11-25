# syntax=docker/dockerfile:1

FROM golang:1.23-alpine AS builder
WORKDIR /app

RUN apk add --no-cache ca-certificates git
COPY go.mod go.sum* ./
RUN go mod download || true

COPY . .
RUN CGO_ENABLED=0 GOOS=linux GOARCH=amd64 go build -ldflags="-s -w" -o /teestore-api ./cmd/api
RUN CGO_ENABLED=0 GOOS=linux GOARCH=amd64 go build -ldflags="-s -w" -o /teestore-seed ./cmd/seed

FROM alpine:3.20
RUN apk add --no-cache ca-certificates tzdata
WORKDIR /app

COPY --from=builder /teestore-api /app/teestore-api
COPY --from=builder /teestore-seed /app/teestore-seed

EXPOSE 8080
ENV PORT=8080
CMD ["/app/teestore-api"]
