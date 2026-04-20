
## Environment Variables (for local development)

When running outside Manus, create a `.env` file in the project root with the following variables:

| Variable | Description |
|---|---|
| `DATABASE_URL` | MySQL/TiDB connection string |
| `JWT_SECRET` | Long random string for signing session cookies |
| `BUILT_IN_FORGE_API_URL` | Manus LLM/Storage API base URL |
| `BUILT_IN_FORGE_API_KEY` | Server-side API key for Manus built-in APIs |
| `VITE_FRONTEND_FORGE_API_KEY` | Frontend API key for Manus built-in APIs |
| `VITE_FRONTEND_FORGE_API_URL` | Frontend API base URL |
| `S3_BUCKET` | S3 bucket name for file storage |
| `S3_REGION` | S3 region (e.g. `us-east-1`) |
| `S3_ACCESS_KEY_ID` | S3 access key |
| `S3_SECRET_ACCESS_KEY` | S3 secret key |
| `S3_ENDPOINT` | (Optional) Custom endpoint for S3-compatible services |
| `SMTP_HOST` | SMTP server host (e.g. `smtp.gmail.com`) |
| `SMTP_PORT` | SMTP port (e.g. `587`) |
| `SMTP_USER` | SMTP username / email address |
| `SMTP_PASS` | SMTP password or app password |
| `SMTP_FROM` | From address for approval emails |
| `GITHUB_TOKEN` | GitHub personal access token (for document import) |
| `GITHUB_REPO` | GitHub repo for sample documents (e.g. `marshad18/change-flow`) |
| `VITE_APP_TITLE` | App title shown in the browser tab |
