# Use the official PostgreSQL 14 image as a base.
# Using a specific version is recommended for production stability.
FROM postgres:14

# Set environment variables for the database.
#
# POSTGRES_PASSWORD: (Mandatory) Sets the password for the 'postgres' superuser.
# This is required by the official entrypoint script.
# IMPORTANT: Replace 'your_strong_password' with a secure password for production.
ENV POSTGRES_PASSWORD=Dgtb353cSW

# Install supervisor to manage multiple processes.
RUN apt-get update && \
    apt-get install -y supervisor && \
    rm -rf /var/lib/apt/lists/*

# Create a directory for the application
WORKDIR /app

# The official image's entrypoint script will automatically execute any
# .sql, .sql.gz, or .sh scripts found in the /docker-entrypoint-initdb.d
# directory when the database is first created.
COPY init.sql /docker-entrypoint-initdb.d/init.sql

# Copy the supervisor configuration file
COPY supervisord.conf /etc/supervisor/conf.d/supervisord.conf

# Run supervisord to start and manage both processes
CMD ["/usr/bin/supervisord"]
