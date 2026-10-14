.PHONY: up down up\:text down\:text up\:voice down\:voice test test\:text test\:voice check

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
