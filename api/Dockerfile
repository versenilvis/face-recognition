# syntax=docker/dockerfile:1
FROM golang:1.23-alpine AS builder

WORKDIR /app
ENV GOTOOLCHAIN=auto

COPY go.mod go.sum ./
RUN --mount=type=cache,target=/go/pkg/mod \
    go mod download

COPY . .
RUN --mount=type=cache,target=/root/.cache/go-build \
    --mount=type=cache,target=/go/pkg/mod \
    CGO_ENABLED=0 GOOS=linux go build -ldflags="-s -w" -o server .

FROM alpine:latest
WORKDIR /app
RUN apk --no-cache add ca-certificates tzdata
ENV TZ=Asia/Ho_Chi_Minh

COPY --from=builder /app/server .
COPY --from=builder /app/web ./web

RUN mkdir -p /data

ENV PORT=8080
EXPOSE 8080

CMD ["./server"]
