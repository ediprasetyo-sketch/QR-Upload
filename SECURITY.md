# Security – QR Upload V1.3

## Authentication model

The public QR upload page intentionally does **not** expose `JOB_API_KEY` to the browser.

The following internal queue endpoints require the `X-API-Key` request header:

- `GET /api/jobs`
- `GET /api/jobs/:jobId`
- `GET /api/jobs/:jobId/file`
- `DELETE /api/jobs/:jobId`
- `POST /api/jobs/:jobId/claim`
- `POST /api/jobs/:jobId/status`

`POST /api/upload` remains public because it is the user-facing QR upload operation.

## Required production configuration

Set `JOB_API_KEY` to a long random secret in the container environment. Never place it in the HTML, JavaScript sent to users, QR code URL, Git repository, or screenshots.

Keep the storage directory outside the public web root.

Expose the service to the Internet only through HTTPS using the planned reverse proxy / Cloudflare layer.

## Current V1.3-B audit findings

- Internal queue API authentication: present via `JOB_API_KEY`.
- Browser exposure of the queue API key: none in the current UI.
- Public upload endpoint: intentional; it still needs rate limiting and abuse controls before unrestricted Internet exposure.
- Upload size enforcement: present through `MAX_FILE_MB` and streamed upload validation.
- PDF signature validation: present (`%PDF-` header check).
- Filename path traversal protection: present through basename/sanitization.
- HTTPS termination: deployment responsibility; to be handled in the Cloudflare/reverse-proxy phase.
- Persistent audit logging: not yet implemented; planned for V1.3-F.
- Distributed/concurrency rate limiting: not yet implemented; planned for V1.3-G.

## Security rule for future changes

Do not put `JOB_API_KEY` into client-side code. Keep administrative/queue operations server-to-server only.
