.PHONY: up down up\:text down\:text up\:voice down\:voice test test\:text test\:voice check build build\:text build\:voice

build:
	bun run build

build\:text:
	bun run build:text

build\:voice:
	bun run build:voice

up: up\:text up\:voice

down: down\:text down\:voice

up\:text:
	bun run up:text

down\:text:
	bun run down:text

up\:voice:
	bun run up:voice

down\:voice:
	bun run down:voice

test: test\:text test\:voice

test\:text:
	bun run test:text

test\:voice:
	bun run test:voice

check:
	bun run check
