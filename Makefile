.PHONY: install setup dev build typecheck test demo docker-up docker-down

install:
	pnpm install

setup:
	pnpm db:migrate
	pnpm db:seed

dev:
	pnpm dev

build:
	pnpm build

typecheck:
	pnpm typecheck

test:
	pnpm test

demo:
	pnpm setup
	pnpm dev

docker-up:
	docker compose up --build

docker-down:
	docker compose down
