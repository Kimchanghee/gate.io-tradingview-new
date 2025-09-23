#!/bin/bash

# Set your project ID
PROJECT_ID="tradingview-auto-gateio"
SERVICE_NAME="gate-io-tradingview-new"
REGION="us-central1"

echo "Deploying to Cloud Run..."

# Build and deploy
gcloud run deploy $SERVICE_NAME \
  --source . \
  --platform managed \
  --region $REGION \
  --allow-unauthenticated \
  --timeout 300 \
  --memory 512Mi \
  --cpu 1 \
  --min-instances 0 \
  --max-instances 10 \
  --port 8080 \
  --env-vars-file .env.yaml \
  --project $PROJECT_ID

echo "Deployment complete!"

# Get the service URL
echo "Service URL:"
gcloud run services describe $SERVICE_NAME \
  --region $REGION \
  --format 'value(status.url)' \
  --project $PROJECT_ID
