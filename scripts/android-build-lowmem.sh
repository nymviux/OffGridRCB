#!/usr/bin/env bash
# Release APK build for machines with little RAM (a full parallel build can push a 6 GB laptop into
# systemd-oomd, which then kills the whole desktop session).
#
# - Runs Gradle in its own systemd scope. Above MemoryHigh the kernel throttles the build and swaps it out
#   instead of killing anything; MemoryMax is a hard ceiling, so only the build dies, never the desktop.
# - Leaves a couple of CPUs to the desktop. ninja (native C++), Gradle workers and Metro all size their
#   parallelism from the CPU set, so this one knob caps the number of concurrent clang/JVM/node processes.
# - One Gradle JVM: no daemon left behind, Kotlin compiled in-process instead of in a second JVM. Projects
#   build one at a time, so only one native (CMake) build runs at once.
#
# Tunables (env), defaults scale with the machine: BUILD_CPUS (nproc - 2), BUILD_MEM_HIGH (70% of RAM),
# BUILD_MEM_MAX (85% of RAM), BUILD_HEAP (2g), BUILD_ABIS (arm64-v8a). Extra arguments are passed to Gradle.
# Linux only.
set -euo pipefail

all_cpus=$(nproc)
total_mb=$(awk '/MemTotal/ { print int($2 / 1024) }' /proc/meminfo)
cpus=${BUILD_CPUS:-$((all_cpus > 2 ? all_cpus - 2 : 1))}
mem_high=${BUILD_MEM_HIGH:-$((total_mb * 70 / 100))M}
mem_max=${BUILD_MEM_MAX:-$((total_mb * 85 / 100))M}
heap=${BUILD_HEAP:-2g}
abis=${BUILD_ABIS:-arm64-v8a}

cd "$(dirname "$0")/.."
if [[ ! -x android/gradlew ]]; then
  echo "android/ not found: run 'npm run android:prebuild' first" >&2
  exit 1
fi
cd android

gradle=(./gradlew assembleRelease
  --no-daemon
  --max-workers="$cpus"
  -Dorg.gradle.parallel=false
  "-Dorg.gradle.jvmargs=-Xmx$heap -XX:MaxMetaspaceSize=512m"
  -Pkotlin.compiler.execution.strategy=in-process
  -PreactNativeArchitectures="$abis"
  "$@")

cpu_set="0-$((cpus - 1))"
echo "lowmem build: $cpus/$all_cpus CPUs, MemoryHigh=$mem_high MemoryMax=$mem_max, heap $heap, ABIs $abis" >&2
if command -v systemd-run >/dev/null && systemd-run --user --scope -q true 2>/dev/null; then
  exec systemd-run --user --scope -q --unit=offgrid-android-build \
    -p MemoryHigh="$mem_high" -p MemoryMax="$mem_max" -p AllowedCPUs="$cpu_set" "${gradle[@]}"
elif command -v taskset >/dev/null; then
  echo "systemd-run unavailable: limiting CPUs only, no memory cap" >&2
  exec taskset -c "$cpu_set" "${gradle[@]}"
else
  echo "systemd-run and taskset unavailable: building without limits" >&2
  exec "${gradle[@]}"
fi
