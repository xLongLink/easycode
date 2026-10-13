BUN ?= bun
INSTALL_DIR ?= $(CURDIR)/.dev/bin
VERSION = $(shell $(BUN) -p 'require("./package.json").version')
TARGET = $(shell $(BUN) -p 'process.platform + "-" + process.arch')

.PHONY: install uninstall uncode

install:
	$(BUN) install --frozen-lockfile
	OPENCODE_VERSION="$(VERSION)" $(BUN) packages/cli/script/build.ts --single --skip-install
	mkdir -p "$(INSTALL_DIR)"
	install -m 755 "packages/cli/dist/cli-$(TARGET)/bin/uncode" "$(INSTALL_DIR)/uncode"
	@echo 'Run uncode: "$(INSTALL_DIR)/uncode"'

uninstall:
	@if [ -x "$(INSTALL_DIR)/uncode" ]; then "$(INSTALL_DIR)/uncode" service stop; fi
	rm -f -- "$(INSTALL_DIR)/uncode"

uncode:
	@$(MAKE) uninstall
	@$(MAKE) install
	@"$(INSTALL_DIR)/uncode" $(ARGS)
