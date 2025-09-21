# AI Studio Gemini App Proxy Server

This nodejs proxy server lets you run your AI Studio Gemini application unmodified, without exposing your API key in the frontend code.


## Instructions

**Prerequisites**:
- [Google Cloud SDK / gcloud CLI](https://cloud.google.com/sdk/docs/install)
- (Optional) Gemini API Key

1. Download or copy the files of your AI Studio app into this directory at the root level.
2. If your app calls the Gemini API, create a Secret for your API key:
     ```
     echo -n "${GEMINI_API_KEY}" | gcloud secrets create gemini_api_key --data-file=-
     ```

3.  Deploy to Cloud Run (optionally including API key):
    ```
    gcloud run deploy my-app --source=. --update-secrets=GEMINI_API_KEY=gemini_api_key:latest
    ```

## Persisting admin data on Google Cloud

The server keeps track of generated webhook URLs as well as the lists of pending, approved and denied users. By default this
state is written to `data/state.json` inside the container, which is ephemeral on platforms such as Cloud Run. To avoid losing
administrative data after deployments configure a Google Cloud Storage bucket and provide the following environment variables
when deploying:

- `STATE_STORAGE_BUCKET` (or `GCS_BUCKET` / `PERSISTENCE_BUCKET`): name of the bucket where the state file should live.
- `STATE_STORAGE_OBJECT` (optional): object path to use inside the bucket. Defaults to `state.json`.
- `STATE_STORAGE_PROJECT` (optional): overrides the project id if it cannot be inferred from the environment.

With these variables set the application will read and write the persistent state from Cloud Storage instead of the local file
system, so webhook URLs and user approval queues survive new deployments. The server obtains access tokens from the Google
Cloud metadata server, so ensure the Cloud Run service account has `storage.objects.get` and `storage.objects.create`
permissions on the target bucket. Local file storage continues to be used automatically when no bucket is configured, allowing
local development without additional setup.
