#!/bin/bash
set -e

# Install required packages
echo "Installing required packages..."
apt-get update && apt-get install -y curl gpg

# Install NVIDIA Container Toolkit
echo "Configuring NVIDIA Container Toolkit repository..."
curl -fsSL https://nvidia.github.io/libnvidia-container/gpgkey | gpg --dearmor -o /usr/share/keyrings/nvidia-container-toolkit-keyring.gpg \
  && curl -s -L https://nvidia.github.io/libnvidia-container/stable/deb/nvidia-container-toolkit.list | \
    sed 's#deb https://#deb [signed-by=/usr/share/keyrings/nvidia-container-toolkit-keyring.gpg] https://#g' | \
    tee /etc/apt/sources.list.d/nvidia-container-toolkit.list

# Uncomment for experimental packages
# sed -i -e '/experimental/ s/^#//g' /etc/apt/sources.list.d/nvidia-container-toolkit.list

echo "Updating package list..."
apt-get update

echo "Installing NVIDIA Container Toolkit..."
apt-get install -y nvidia-container-toolkit

echo "Starting Ollama server..."
# Start Ollama server
ollama serve &
OLLAMA_PID=$!
echo "Ollama server is running"

# Pull the model
echo "Pulling llama3.2 model..."
if ! ollama pull llama3.1; then
    echo "First attempt to pull model failed, retrying..."
    sleep 5
    if ! ollama llama3.1; then
        echo "Failed to pull model after retries"
        exit 1
    fi
fi

echo "Model pulled successfully"
echo "Listing current installed models:"
ollama list

# Monitor Ollama process
while kill -0 $OLLAMA_PID 2>/dev/null; do
    sleep 1
done

# If we get here, Ollama has stopped
echo "Ollama server stopped unexpectedly"
exit 1