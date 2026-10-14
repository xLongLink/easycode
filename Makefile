.PHONY: up down up\:text down\:text up\:voice down\:voice test test\:text test\:voice check

up: up\:text up\:voice

down: down\:text down\:voice

up\:text:
	bash text/setup.sh install

down\:text:
	bash text/setup.sh uninstall

up\:voice:
	bash voice/setup.sh install

down\:voice:
	bash voice/setup.sh uninstall

test: test\:text test\:voice

test\:text:
	bun --cwd text test

test\:voice:
	bun --cwd voice test

check:
	bun run check
