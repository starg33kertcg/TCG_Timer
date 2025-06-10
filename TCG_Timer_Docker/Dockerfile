# Use an official Python runtime as a parent image
FROM python:3.10-slim

# Set the working directory in the container
WORKDIR /app

# Create a non-root user to run the application
RUN useradd -r -s /bin/false -U timer
RUN chown timer:timer /app

# Copy the dependencies file first to leverage Docker layer caching
COPY app_files/requirements.txt .

# Install any needed packages specified in requirements.txt
RUN pip install --no-cache-dir -r requirements.txt

# Copy the rest of the application code
COPY app_files/ .

# --- NEW: Create config directory and set permissions ---
RUN mkdir -p /app/config && chown timer:timer /app/config

# Ensure the uploads directory exists and is owned by the app user
# This is where the volume will be mounted
RUN mkdir -p /app/static/uploads && chown -R timer:timer /app/static

# Switch to the non-root user
USER timer

# Expose the port Gunicorn will run on inside the container network
EXPOSE 8000

# Define the command to run your app using Gunicorn
CMD ["gunicorn", "--workers", "3", "--bind", "0.0.0.0:8000", "app:app"]
