#!/bin/sh
set -eu

mode="${LOCKPASS_DEPLOY_MODE:-local}"
public_url="${LOCKPASS_PUBLIC_URL:-http://localhost}"
admin_url="${LOCKPASS_ADMIN_URL:-http://localhost:8081}"

fail() {
	echo "lockpass gateway: $*" >&2
	exit 1
}

require_origin() {
	name="$1"
	value="$2"
	scheme="$3"

	case "$value" in
		"${scheme}://"*) ;;
		*) fail "$name must start with ${scheme}:// in $mode mode" ;;
	esac

	authority="${value#*://}"
	case "$authority" in
		""|*/*|*\?*|*\#*|*@*) fail "$name must be an origin without a path, query, fragment, or credentials" ;;
	esac
}

case "$mode" in
	local)
		require_origin LOCKPASS_PUBLIC_URL "$public_url" http
		require_origin LOCKPASS_ADMIN_URL "$admin_url" http
		config=/etc/caddy/Caddyfile.local
		;;
	production)
		require_origin LOCKPASS_PUBLIC_URL "$public_url" https
		require_origin LOCKPASS_ADMIN_URL "$admin_url" https
		case "$public_url $admin_url" in
			*://localhost*|*://127.*|*://\[::1\]*) fail "production URLs must use publicly resolvable hostnames" ;;
		esac
		config=/etc/caddy/Caddyfile.production
		;;
	*)
		fail "LOCKPASS_DEPLOY_MODE must be local or production"
		;;
esac

[ "$public_url" != "$admin_url" ] || fail "LOCKPASS_PUBLIC_URL and LOCKPASS_ADMIN_URL must be different"

echo "lockpass gateway: starting in $mode mode"
exec caddy run --config "$config" --adapter caddyfile
