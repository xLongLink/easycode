BUN ?= bun
INSTALL_DIR ?= $(CURDIR)/.dev/bin
VERSION = $(shell $(BUN) -p 'require("./package.json").version')
TARGET = $(shell $(BUN) -p 'process.platform + "-" + process.arch')

.PHONY: install uninstall uncode

install:
	$(BUN) install --frozen-lockfile
	OPENCODE_VERSION="$(VERSION)" OPENCODE_CHANNEL=latest $(BUN) packages/cli/script/build.ts --single --skip-install
	bash install --binary "packages/cli/dist/cli-$(TARGET)/bin/uncode" --install-dir "$(INSTALL_DIR)" --no-modify-path
	@echo 'Run uncode: "$(INSTALL_DIR)/uncode"'

uninstall:
	@if [ -x "$(INSTALL_DIR)/uncode" ]; then "$(INSTALL_DIR)/uncode" service stop; fi
	rm -f -- "$(INSTALL_DIR)/uncode"

uncode:
	@"$(INSTALL_DIR)/uncode" $(ARGS)
