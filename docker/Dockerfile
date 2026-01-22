# MineServerGUI Dockerfile
FROM python:3.11-slim

# Install system dependencies
RUN apt-get update && apt-get install -y \
    screen \
    curl \
    wget \
    openjdk-21-jre-headless \
    && rm -rf /var/lib/apt/lists/*

# Set working directory
WORKDIR /app

# Copy backend requirements and install Python dependencies
COPY ../backend/requirements.txt /app/backend/requirements.txt
RUN pip install --no-cache-dir -r /app/backend/requirements.txt

# Copy application files
COPY ../backend/ /app/backend/
COPY ../index.html /app/index.html
COPY ../server-details.html /app/server-details.html
COPY ../login.html /app/login.html
COPY ../setup.html /app/setup.html
COPY ../credits.html /app/credits.html
COPY ../js/ /app/js/
COPY ../css/ /app/css/
COPY ../assets/ /app/assets/

# Create directories for data persistence
RUN mkdir -p /app/servers /app/backend/server_configs /app/backend/server_templates

# Environment variables (can be overridden)
ENV SERVERS_DIR=/app/servers
ENV CONFIGS_DIR=/app/backend/server_configs
ENV TEMPLATES_DIR=/app/backend/server_templates
ENV HOST=0.0.0.0
ENV PORT=5000
ENV DEBUG=false
ENV PANORAMA_INTENSITY=1.05

# Expose the Flask port
EXPOSE 5000

# Create startup script
RUN echo '#!/bin/bash\n\
# Generate config.json from environment variables\n\
cat > /app/backend/config.json <<EOF\n\
{\n\
    "servers_dir": "${SERVERS_DIR}",\n\
    "configs_dir": "${CONFIGS_DIR}",\n\
    "panorama_intensity": ${PANORAMA_INTENSITY},\n\
    "host": "${HOST}",\n\
    "port": ${PORT},\n\
    "debug": ${DEBUG}\n\
}\n\
EOF\n\
\n\
echo "Starting MineServerGUI..."\n\
echo "Configuration:"\n\
cat /app/backend/config.json\n\
echo ""\n\
\n\
# Start Flask application\n\
cd /app/backend\n\
python app.py\n\
' > /app/start.sh && chmod +x /app/start.sh

# Set working directory to backend
WORKDIR /app/backend

# Run the application
CMD ["/app/start.sh"]
