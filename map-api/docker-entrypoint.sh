#!/bin/sh

echo 'starting application'

# -c is what makes gunicorn_config.py apply: gunicorn only auto-loads a file named
# gunicorn.conf.py, so without it GUNICORN_PROCESSES and GUNICORN_THREADS are
# ignored and the pod runs three single-threaded processes - three copies of the
# in-process cache, the single-flight map, the click epoch and the metadata pool,
# none of which see each other's work.
#
# exec so gunicorn, not a shell, receives SIGTERM and shuts down gracefully.
exec gunicorn -c gunicorn_config.py --bind 0.0.0.0:8080 --timeout 60 wsgi:application
