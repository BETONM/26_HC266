cmake_minimum_required(VERSION 3.8)
project(simulation_env_bringup)

find_package(ament_cmake REQUIRED)

install(DIRECTORY launch config
  DESTINATION share/${PROJECT_NAME}
)

# The Gazebo assets live at the repo root, outside this package, so that the
# Blender exporter can write them without knowing about the ROS workspace.
# Install them into the package share so the launch file can find them after
# a normal `colcon build`.
set(GAZEBO_ASSETS "${CMAKE_CURRENT_SOURCE_DIR}/../../gazebo")
if(EXISTS "${GAZEBO_ASSETS}")
  install(DIRECTORY "${GAZEBO_ASSETS}/models" "${GAZEBO_ASSETS}/worlds"
    DESTINATION share/${PROJECT_NAME}/gazebo
  )
else()
  message(WARNING "gazebo assets not found at ${GAZEBO_ASSETS} - "
                  "is this package inside the SimulationEnv repo?")
endif()

ament_package()
