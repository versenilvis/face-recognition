# NOTE: RUN "just -l" TO QUICKLY VIEW ALL COMMANDS
set dotenv-load

# start full stack via docker
up:
    @docker compose up --build

# stop docker stack
down:
    @docker compose down

# dev: go api with hot reload (serves templates + api)
api:
    @cd api && air

# dev: python inference service
infer:
    @cd infer && python app.py

# clean up pkg
tidy:
    @cd api && go mod tidy

# run tests
test:
    @cd api && go test -v ./...

dev:
    @just api && just infer
