# Monitoring / Observability

Production monitoring with **Prometheus** (metrics + alerting) and **Grafana**
(dashboards). Kubernetes and infrastructure metrics come from **kube-state-metrics**
and **node-exporter**; application metrics are exposed by the backend itself.

## Files

```
monitoring/
├── namespace.yaml               monitoring namespace
├── helm-values.yaml             kube-prometheus-stack values (recommended install)
├── prometheus/
│   ├── prometheus.yml           scrape config (app pods, cadvisor, KSM, node-exporter)
│   └── alert-rules.yml          13 alert rules (app + k8s + infra)
└── grafana/
    ├── datasource.yaml          Prometheus datasource provisioning
    ├── dashboard-provider.yaml  dashboard provider provisioning
    └── dashboards/
        ├── application.json     RED: request rate, error rate, latency, health
        ├── kubernetes.json      CPU/mem, restarts, availability, deployment health
        └── infrastructure.json  node + cluster resource utilization
```

## What is monitored (and where the metrics come from)

| Signal | Metric(s) | Source |
|---|---|---|
| Request rate | `http_requests_total` | **backend** (`/metrics`) |
| Error rate | `http_requests_total{status_code=~"5.."}` | **backend** |
| Latency | `http_request_duration_seconds` (histogram) | **backend** |
| Application health | `up{app="backend"}`, `/health`, `/ready` | backend + Prometheus |
| Pod CPU / memory | `container_cpu_usage_seconds_total`, `container_memory_working_set_bytes` | kubelet / cAdvisor |
| Pod restarts | `kube_pod_container_status_restarts_total` | kube-state-metrics |
| Pod availability | `kube_pod_status_phase` | kube-state-metrics |
| Deployment health | `kube_deployment_status_replicas_available/unavailable` | kube-state-metrics |
| Node health | `kube_node_status_condition` | kube-state-metrics |
| Node utilization | `node_cpu_seconds_total`, `node_memory_*` | node-exporter |
| Cluster utilization | `kube_pod_container_resource_requests` vs `kube_node_status_allocatable` | kube-state-metrics |

> The application metrics above were **verified**: the backend image was built and
> run, and `GET /metrics` returned `http_requests_total`,
> `http_request_duration_seconds_*`, and the default `netflow_backend_*` process
> metrics with correct `method`/`route`/`status_code` labels. See "Verification".

## Application instrumentation

The backend uses `prom-client` (`backend/src/metrics/metrics.ts`):
- Default Node.js/process metrics (prefixed `netflow_backend_`).
- `http_requests_total{method,route,status_code}` — request + error rate.
- `http_request_duration_seconds{...}` — latency histogram.
- Exposed at `GET /metrics`; the backend pods carry `prometheus.io/scrape`
  annotations so Prometheus discovers them automatically.

## Install (recommended: kube-prometheus-stack)

This chart bundles Prometheus, Alertmanager, Grafana, node-exporter, and
kube-state-metrics.

```bash
helm repo add prometheus-community https://prometheus-community.github.io/helm-charts
helm repo update
helm upgrade --install monitoring prometheus-community/kube-prometheus-stack \
  -n monitoring --create-namespace \
  -f monitoring/helm-values.yaml \
  --set grafana.adminPassword=<choose-a-strong-password>   # not stored in Git
```

Apply the alert rules and dashboards:

```bash
# Alert rules as a PrometheusRule (operator picks them up):
kubectl -n monitoring create configmap netflow-rules \
  --from-file=monitoring/prometheus/alert-rules.yml --dry-run=client -o yaml | kubectl apply -f -

# Dashboards for the Grafana sidecar (label makes them auto-load):
for f in monitoring/grafana/dashboards/*.json; do
  name=$(basename "$f" .json)
  kubectl -n monitoring create configmap "grafana-dash-$name" --from-file="$f" \
    --dry-run=client -o yaml \
    | kubectl label --local -f - grafana_dashboard=1 -o yaml \
    | kubectl apply -f -
done
```

## Prometheus configuration

`prometheus/prometheus.yml` (for a standalone Prometheus, or as reference) defines:
- `kubernetes-pods` — scrapes any pod annotated `prometheus.io/scrape: "true"`
  (our backend), honoring `prometheus.io/port` and `prometheus.io/path`.
- `kubernetes-cadvisor` — per-container CPU/memory via the kubelet.
- `kube-state-metrics` and `node-exporter` — object state and node metrics.
- `rule_files` — loads the alert rules.

## Grafana

- **Datasource** (`grafana/datasource.yaml`): Prometheus at
  `http://prometheus.monitoring.svc:9090`, set as default.
- **Dashboards** (`grafana/dashboards/*.json`), organized as a production ops view:
  - **Application (RED):** request rate, 5xx error rate, p50/p95/p99 latency, backend up.
  - **Kubernetes Workloads:** CPU/memory per pod, restarts, desired-vs-available
    replicas, unavailable replicas, running/not-running pods.
  - **Infrastructure / Nodes:** node CPU/memory/filesystem utilization, nodes ready,
    cluster CPU/memory requests vs allocatable.
- **Admin password** is provided at install time (Helm `--set` or a pre-created
  Secret) — never committed.

## Alerts and what they mean

| Alert | Fires when | Meaning / action |
|---|---|---|
| `HighErrorRate` | >5% 5xx over 5m | App returning server errors — check backend logs/DB. |
| `HighLatencyP95` | p95 > 1s for 10m | Requests slow — check DB, CPU, downstream calls. |
| `BackendDown` | `up{app="backend"}==0` for 2m | Prometheus can't scrape backend — pod down/unreachable. |
| `PodRestartSpike` | >3 restarts/15m | Crash looping — inspect `--previous` logs. |
| `UnavailableReplicas` | unavailable replicas >0 for 10m | Deployment degraded — pods not becoming ready. |
| `DeploymentReplicaMismatch` | desired != available for 15m | Rollout stuck / scheduling issues. |
| `PodNotReady` | Pending/Unknown for 10m | Scheduling, image, or resource problem. |
| `HighContainerCPU` | >90% of CPU limit for 10m | Throttling risk — scale out or raise limits. |
| `HighContainerMemory` | >90% of memory limit for 10m | OOMKill risk — raise limits or fix leak. |
| `NodeNotReady` | node Ready==false for 5m | Node problem — check kubelet/node. |
| `NodeHighCPU` | node CPU >85% for 10m | Node saturation — scale the node group. |
| `NodeHighMemory` | node memory >85% for 10m | Node memory pressure. |
| `NodeDiskPressure` | DiskPressure condition | Node low on disk — clean up / add capacity. |

## Troubleshooting workflow

1. **An alert fired — where?** Open Grafana → the relevant dashboard, and check
   Alertmanager for the alert's labels (namespace/pod/node).
2. **App errors/latency** (`HighErrorRate`, `HighLatencyP95`):
   ```bash
   kubectl -n netflow-prod logs deploy/backend --tail=200
   # Application dashboard → error rate by status code, latency percentiles
   ```
   Check `/ready` and DB connectivity; confirm `backend-secrets` synced.
3. **Pod issues** (`PodRestartSpike`, `PodNotReady`, `UnavailableReplicas`):
   ```bash
   kubectl -n netflow-prod get pods
   kubectl -n netflow-prod describe pod <pod>
   kubectl -n netflow-prod logs <pod> --previous
   ```
4. **Resource pressure** (`HighContainerCPU/Memory`):
   - Kubernetes dashboard → CPU/memory per pod. Scale the HPA bounds or raise limits.
   - OOMKilled shows in `kubectl describe pod` events.
5. **Node problems** (`NodeNotReady`, `NodeHigh*`, `NodeDiskPressure`):
   ```bash
   kubectl get nodes
   kubectl describe node <node>
   ```
   Cordon/drain and let the node group replace it; scale the group if saturated.
6. **No data on a dashboard?** Confirm Prometheus is scraping:
   Prometheus UI → *Status → Targets*. For the app, verify the pod has the
   `prometheus.io/scrape` annotation and `/metrics` responds.

## Verification

- **Application metrics:** built and ran the backend container and scraped
  `GET /metrics` — confirmed `http_requests_total` (with `method`/`route`/
  `status_code`), `http_request_duration_seconds` histogram, and default
  `netflow_backend_*` process metrics are present. A unit test
  (`backend/src/metrics/metrics.test.ts`) also asserts these.
- **Prometheus config + rules:** validated with `promtool` (via the official
  `prom/prometheus` image): `check config` → *valid syntax*; `check rules` →
  *SUCCESS: 13 rules found*.
- **Dashboards + provisioning YAML:** parsed and confirmed valid JSON/YAML.
- Kubernetes/infrastructure metric queries target standard kube-state-metrics,
  cAdvisor, and node-exporter series; these are verified against a live cluster
  once the stack is installed (no cluster was available in this environment).
