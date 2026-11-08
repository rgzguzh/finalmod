#!/usr/bin/env bash
# Logging wrapper: prints the command, runs it, tees output into build.log
cd /workspaces/finalmod || exit 1
export JAVA_HOME=/usr/lib/jvm/java-17-openjdk-amd64
export PATH="$JAVA_HOME/bin:/usr/lib/android-sdk/build-tools/29.0.3:/usr/lib/android-sdk/build-tools/debian:$PATH"
export BT=/usr/lib/android-sdk/build-tools/29.0.3
echo -e "\n===== [$(date -u +%FT%TZ)] \$ $* =====" >>build.log
"$@" > >(tee -a build.log) 2> >(tee -a build.log >&2)
rc=$?
echo "----- exit=$rc -----" >>build.log
exit $rc
