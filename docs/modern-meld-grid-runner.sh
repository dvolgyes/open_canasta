#!/bin/sh
set -eu

child_pid=
stop() {
	if [ -n "$child_pid" ]; then
		if ! kill -INT "$child_pid"; then
			printf 'Could not signal study process %s\n' "$child_pid" >&2
		fi
		if wait "$child_pid"; then
			printf 'Study process %s finished while stopping\n' "$child_pid" >&2
		else
			printf 'Study process %s stopped with status %s\n' "$child_pid" "$?" >&2
		fi
	fi
	exit 2
}
trap stop INT TERM

mkdir -p docs/modern-meld-grid-results
log_dir=${MODERN_MELD_LOG_DIR:-/tmp}
mkdir -p "$log_dir"
completed=0
for weight in neg12 neg4 pos0 pos4 pos8 pos16; do
	for score in 0 3000 5000; do
		label="$weight-$score"
		config="docs/modern-meld-grid-configs/$label.json"
		output="docs/modern-meld-grid-results/$label"
		set -- node --import tsx scripts/modern-study.ts "$config" "$output"
		if [ -f "$output/manifest.json" ]; then set -- "$@" --resume; fi
		NODE_COMPILE_CACHE=/tmp/open-canasta-node-cache "$@" > "$log_dir/open-canasta-meld-$label.stdout" 2> "$log_dir/open-canasta-meld-$label.stderr" &
		child_pid=$!
		if wait "$child_pid"; then status=0; else status=$?; fi
		child_pid=
		if [ "$status" -ne 2 ]; then
			printf 'Unexpected study exit for %s: %s\n' "$label" "$status" >&2
			exit 1
		fi
		NODE_COMPILE_CACHE=/tmp/open-canasta-node-cache node --import tsx scripts/modern-hand-summary.ts "$config" "$output" > "$output/hand-summary.json"
		completed=$((completed + 1))
		printf '{"completedConfigs":%s,"totalConfigs":18}\n' "$completed"
	done
done
