#!/usr/bin/env bash
# Run a lab bench world in Gazebo Harmonic inside the robotis/open-manipulator
# container (the host has no gz / ROS 2 installed).
#
#   ./run_gazebo.sh              4-zone world, GUI
#   ./run_gazebo.sh 3zone        3-zone world, GUI
#   ./run_gazebo.sh 4zone -s     server only, no GUI
#   ./run_gazebo.sh ros          ros2 launch + ros_gz_bridge (4-zone)
#   ./run_gazebo.sh ros 3zone    ros2 launch + ros_gz_bridge (3-zone)
set -euo pipefail

REPO="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
IMAGE=robotis/open-manipulator:5.0.0
declare -A WORLDS=([4zone]=lab_bench.world [3zone]=lab_bench_3zone.world)

MODE=gz
if [[ "${1:-}" == "ros" ]]; then MODE=ros; shift; fi
LAYOUT="${1:-4zone}"; shift || true
[[ -n "${WORLDS[$LAYOUT]:-}" ]] || { echo "unknown layout: $LAYOUT (4zone|3zone)"; exit 1; }

xhost +local:root >/dev/null 2>&1 || true

if [[ $MODE == gz ]]; then
  INNER="export GZ_SIM_RESOURCE_PATH=/sim/gazebo/models
         gz sim -r /sim/gazebo/worlds/${WORLDS[$LAYOUT]} $*"
else
  # colcon build is idempotent; the package only installs files
  INNER="source /opt/ros/jazzy/setup.bash
         mkdir -p /ws/src && ln -sfn /sim/ros2/simulation_env_bringup /ws/src/simulation_env_bringup
         cd /ws && colcon build --packages-select simulation_env_bringup --symlink-install
         source /ws/install/setup.bash
         ros2 launch simulation_env_bringup lab_bench.launch.py layout:=$LAYOUT $*"
fi

# GPU passthrough when the host has a DRI device, otherwise software rendering
GPU=()
[[ -e /dev/dri ]] && GPU=(--device /dev/dri --group-add video)

exec docker run --rm -it \
  --net=host --ipc=host "${GPU[@]}" \
  -e DISPLAY="$DISPLAY" -e QT_X11_NO_MITSHM=1 \
  -v /tmp/.X11-unix:/tmp/.X11-unix:rw \
  -v "$REPO":/sim:rw \
  "$IMAGE" bash -c "$INNER"
