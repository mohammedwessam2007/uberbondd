FROM postgres:16.15-bookworm
RUN apt-get update && apt-get install -y --no-install-recommends python3 python3-psycopg2 python3-cryptography ca-certificates && rm -rf /var/lib/apt/lists/*
COPY rescue.py trident.py /opt/
RUN useradd --uid 10001 --create-home rescue
USER 10001
ENTRYPOINT ["python3", "/opt/trident.py"]
