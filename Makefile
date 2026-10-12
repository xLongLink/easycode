BUN ?= bun
INSTALL_DIR ?= $(CURDIR)/.dev/bin
VERSION = $(shell $(BUN) -p 'require("./package.json").version')
TARGET = $(shell $(BUN) -p 'process.platform + "-" + process.arch')

.PHONY: install uninstall easycode

install:
	$(BUN) install --frozen-lockfile
	OPENCODE_VERSION="$(VERSION)" OPENCODE_CHANNEL=latest $(BUN) packages/cli/script/build.ts --single --skip-install
	bash install --binary "packages/cli/dist/cli-$(TARGET)/bin/easycode" --install-dir "$(INSTALL_DIR)" --no-modify-path
	@echo 'Run easycode: "$(INSTALL_DIR)/easycode"'

uninstall:
	@if [ -x "$(INSTALL_DIR)/easycode" ]; then "$(INSTALL_DIR)/easycode" service stop; fi
	rm -f -- "$(INSTALL_DIR)/easycode"

easycode:
	@"$(INSTALL_DIR)/easycode" $(ARGS)
