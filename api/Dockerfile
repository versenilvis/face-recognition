FROM golang:1.23-alpine AS builder

WORKDIR /app
ENV GOTOOLCHAIN=auto
COPY go.mod go.sum ./
RUN go mod download

COPY . .
RUN CGO_ENABLED=0 GOOS=linux go build -o server .

FROM alpine:latest
WORKDIR /app
COPY --from=builder /app/server .
COPY --from=builder /app/web ./web

RUN mkdir -p /data

ENV PORT=8080
EXPOSE 8080

CMD ["./server"]
