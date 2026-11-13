# Storage provisioning guide

Opero requires **private** S3-compatible object storage for staging/production.

## Buckets

| Bucket env | Purpose |
| --- | --- |
| `S3_QUARANTINE_BUCKET` | Fresh uploads pending malware scan |
| `S3_DOCUMENTS_BUCKET` | Accepted financial documents |
| `S3_REPORTS_BUCKET` | Published PDF artifacts (defaults to documents bucket) |

## Requirements

- Block public ACLs / public access
- Prefer SSE-S3 (`S3_SSE=AES256`) when the provider supports it
- API-mediated access only (no browser→bucket uploads)
- Keys are tenant-scoped: `org/<organizationId>/...`
- Retention: `DOCUMENT_RETENTION_DAYS` (application policy); configure lifecycle rules on the provider
- Rotate access keys via provider IAM; update Railway vars; restart API/worker

## Local validation

```bash
docker compose --profile s3 up -d minio
# Set DOCUMENT_STORAGE_DRIVER=s3 and S3_* against 127.0.0.1:9000
```

External managed provisioning remains **owner-gated**.
