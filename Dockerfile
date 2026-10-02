FROM ghcr.io/pocket-id/pocket-id:v2.17.0@sha256:19f556d5852115c8ebbef271f6f7cf610d8803312a1fa63f29e1b342fe9d2939
USER root
COPY apk.lock scripts/audit-apk-lock.py /opt/pocket-gate/
RUN apk info -v > /tmp/pocket-gate-apk.before \
    && xargs apk add --no-cache < /opt/pocket-gate/apk.lock \
    && python3 /opt/pocket-gate/audit-apk-lock.py /tmp/pocket-gate-apk.before /opt/pocket-gate/apk.lock \
    && rm /tmp/pocket-gate-apk.before
COPY gateway.py /opt/pocket-gate/gateway.py
COPY scripts/entrypoint.sh /opt/pocket-gate/entrypoint.sh
COPY tests /opt/pocket-gate/tests
COPY licenses /usr/share/doc/pocket-gate/licenses
COPY LICENSE /usr/share/doc/pocket-gate/licenses/recipe-MIT.txt
WORKDIR /app
EXPOSE 8080
HEALTHCHECK --interval=15s --timeout=5s --start-period=30s --retries=5 CMD ["python3", "/opt/pocket-gate/gateway.py", "healthcheck"]
ENTRYPOINT ["sh", "/opt/pocket-gate/entrypoint.sh"]
CMD ["python3", "/opt/pocket-gate/gateway.py"]
