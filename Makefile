.PHONY: help setup dev test clean install-backend install-frontend run-backend run-frontend docker-up docker-down migrate

help:
	@echo "Available commands:"
	@echo "  make setup           - Initial project setup"
	@echo "  make install-backend - Install backend dependencies"
	@echo "  make install-frontend- Install frontend dependencies"
	@echo "  make dev             - Run both backend and frontend"
	@echo "  make run-backend     - Run backend only"
	@echo "  make run-frontend    - Run frontend only"
	@echo "  make test            - Run all tests"
	@echo "  make migrate         - Run database migrations"
	@echo "  make docker-up       - Start Docker services"
	@echo "  make docker-down     - Stop Docker services"
	@echo "  make clean           - Clean build artifacts"

setup: install-backend install-frontend
	@echo "Project setup complete!"

install-backend:
	cd backend && poetry install

install-frontend:
	cd frontend && npm install

run-backend:
	cd backend && poetry run uvicorn main:app --reload --host 0.0.0.0 --port 8000

run-frontend:
	cd frontend && npm run dev

dev:
	@echo "Starting development servers..."
	@make -j2 run-backend run-frontend

test:
	@echo "Running backend tests..."
	cd backend && poetry run pytest
	@echo "Running frontend tests..."
	cd frontend && npm run test

test-backend:
	cd backend && poetry run pytest -v

test-frontend:
	cd frontend && npm run test

migrate:
	cd backend && poetry run alembic upgrade head

migrate-create:
	cd backend && poetry run alembic revision --autogenerate -m "$(message)"

docker-up:
	cd backend && docker-compose up -d

docker-down:
	cd backend && docker-compose down

docker-logs:
	cd backend && docker-compose logs -f

clean:
	find . -type d -name "__pycache__" -exec rm -rf {} +
	find . -type f -name "*.pyc" -delete
	find . -type d -name "node_modules" -exec rm -rf {} +
	find . -type d -name "dist" -exec rm -rf {} +
	find . -type d -name ".pytest_cache" -exec rm -rf {} +

lint-backend:
	cd backend && poetry run black app tests
	cd backend && poetry run ruff check --fix app tests

lint-frontend:
	cd frontend && npm run lint

format: lint-backend lint-frontend
	@echo "Code formatted!"

build-backend:
	cd backend && docker build -t bi-dashboard-backend .

build-frontend:
	cd frontend && npm run build

deploy-railway:
	@echo "Deploying backend to Railway..."
	cd backend && railway up

deploy-vercel:
	@echo "Deploying frontend to Vercel..."
	cd frontend && vercel --prod
