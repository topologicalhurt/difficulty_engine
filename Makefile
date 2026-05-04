.PHONY: build dev lint test check audit

build:
	npm run build

dev:
	npm run dev

lint:
	npm run lint

test:
	npm run test

check:
	npm run check

audit:
	python3 scripts/audit_source.py
