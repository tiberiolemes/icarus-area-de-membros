FROM ghcr.io/frappe/lms@sha256:a8dff54c23458bdf8b0b5fa8acdcb07912203e52774aabe206c6ed02f6fa8bd5
COPY --chown=frappe:frappe . /home/frappe/frappe-bench/apps/lms
COPY --chown=frappe:frappe .local/payments /home/frappe/frappe-bench/apps/payments
ARG TIBERIO_SOURCE_SHA256
ARG TIBERIO_BUILD_RECIPE_SHA256
LABEL local.tiberio.source-sha256=$TIBERIO_SOURCE_SHA256
LABEL local.tiberio.build-recipe-sha256=$TIBERIO_BUILD_RECIPE_SHA256
USER root
RUN python apps/lms/local/quality/integration08/system_overlay.py \
    && python apps/lms/local/quality/integration08/system_overlay.py \
    && python apps/lms/local/quality/integration08/system_overlay.py --verify-only
USER frappe
RUN env/bin/pip install --no-cache-dir -c apps/lms/local/requirements.txt -e apps/payments -e apps/lms \
    && bench set-config -gp socketio_port 9000 \
    && printf 'frappe\npayments\nlms\n' > sites/apps.txt \
    && ln -s ../apps/lms/lms/public assets/lms \
    && ln -s ../apps/payments/payments/public assets/payments \
    && ln -s /home/frappe/frappe-bench/assets sites/assets
RUN --mount=type=cache,target=/home/frappe/.cache/yarn,uid=1000,gid=1000 \
    cd apps/lms && yarn install --frozen-lockfile --non-interactive \
    && cd ../frappe/studio/frontend && yarn install --frozen-lockfile --non-interactive \
    && cd ../../flow && yarn install --frozen-lockfile --non-interactive
RUN python apps/lms/local/i18n/merge_catalogs.py \
      --frontend apps/lms/local/i18n/lms-pt-BR.json \
      --output apps/lms/local/i18n/merged-pt-BR.json --csv apps/lms/lms/translations/pt-BR.csv \
    && python apps/lms/local/i18n/apply_overlay.py \
      --framework apps/frappe/frappe --framework-packages apps/frappe --payments apps/payments/payments \
    && python apps/lms/local/i18n/apply_frontend_context.py --lms-app apps/lms \
    && python apps/lms/local/i18n/apply_overlay.py \
      --framework apps/frappe/frappe --framework-packages apps/frappe --payments apps/payments/payments \
    && python apps/lms/local/i18n/apply_frontend_context.py --lms-app apps/lms \
    && python apps/lms/local/quality/auth/overlay.py --framework apps/frappe/frappe \
    && python apps/lms/local/quality/auth/overlay.py --framework apps/frappe/frappe \
    && python apps/lms/local/quality/integration08/overlay.py --framework-app apps/frappe \
    && python apps/lms/local/quality/integration08/overlay.py --framework-app apps/frappe \
    && python apps/lms/local/i18n/check_onboarding.py --framework-app apps/frappe \
    && python apps/lms/local/i18n/verify_applied.py \
    && python apps/lms/frontend/scripts/audit-i18n.py \
    && python -m unittest discover -s apps/lms/local/i18n -p 'test_*.py' -v \
    && python -m unittest discover -s apps/lms/local/quality/integration08 -p test_compose_auth.py -v
RUN cd apps/lms && ../../env/bin/python -m unittest discover -s lms/tests -p '*_isolated.py' -v
RUN cd apps/lms/frontend && NODE_OPTIONS=--max-old-space-size=768 yarn test --maxWorkers=1
RUN --mount=type=cache,target=/home/frappe/.cache/yarn,uid=1000,gid=1000 \
    NODE_OPTIONS=--max-old-space-size=768 RAYON_NUM_THREADS=1 GOMAXPROCS=2 GOMEMLIMIT=256MiB \
    env/bin/python apps/lms/local/quality/integration08/build_bundles.py \
    && python apps/lms/local/i18n/verify_applied.py \
    && python apps/lms/local/quality/integration08/overlay.py --framework-app apps/frappe --verify-only
RUN set -e; for app in frappe payments lms; do \
      for locale in pt pt_BR; do bench compile-po-to-mo --app "$app" --locale "$locale" --force; done; \
    done
