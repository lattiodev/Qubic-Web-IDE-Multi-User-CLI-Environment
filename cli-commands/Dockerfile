ARG base_image="ubuntu:22.04"
ARG image_type="release"
ARG package_location=""
ARG app_location="/qubic-cli"
ARG user_id="default"

# Set environment variables to avoid user prompts during installation
ARG DEBIAN_FRONTEND=noninteractive

#********************Setup a global runtime environment for running.
FROM ${base_image} AS global_runtime
ARG DEBIAN_FRONTEND

# Install runtime environment - this will be cached globally
RUN apt-get update && apt-get clean

#********************Setup a global develop environment for building.
FROM global_runtime AS global_develop
ARG DEBIAN_FRONTEND

# Install cmake, git and dev environments - this will be cached globally
RUN apt-get install -y cmake build-essential && \
    apt-get clean

#********************User-specific runtime environment
FROM global_runtime AS build_image_runtime
ARG user_id
# Add a label to identify the user's image
LABEL user_id="${user_id}"

#********************User-specific develop environment
FROM global_develop AS build_image_develop
ARG user_id
# Add a label to identify the user's image
LABEL user_id="${user_id}"

#********************Package
FROM global_runtime AS build_image_release
ARG package_location
ARG app_location
ARG user_id

# Create and set the working directory
WORKDIR ${app_location}

# Copy the requirements.txt file
COPY ${package_location}/ ${app_location}/

# Add a label to identify the user's image
LABEL user_id="${user_id}"

# Place holder to trigger above build
FROM build_image_${image_type}
ARG DEBIAN_FRONTEND
ARG APP_DEPENDENCIES
ARG CMD_BUILD
ARG package_location
ARG app_location
ARG user_id