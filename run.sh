#!/bin/bash

set -e

echo "Building Docker images..."
docker-compose build

echo "Starting Docker container"
docker-compose up -d

echo "Docker containers are running."
