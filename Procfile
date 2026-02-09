web: sh -c 'set -e; TINA_ENV="${TINA_ENV:-prod}"; CONVEX_URL=$(cargo run --quiet --manifest-path tina-session/Cargo.toml -- config convex-url --env "$TINA_ENV"); cd tina-web; VITE_TINA_ENV="$TINA_ENV" VITE_CONVEX_URL="$CONVEX_URL" npm run dev'
convex: npx convex dev
daemon: sh -c 'cargo run --manifest-path tina-daemon/Cargo.toml -- --env "${TINA_ENV:-prod}"'
