#!/bin/bash
# CacheBash Cloud Run Deployment Script
# Usage: ./deploy.sh [project-id] [region]

set -e

# Configuration
PROJECT_ID="${1:-cachebash-app}"
REGION="${2:-us-central1}"
SERVICE_NAME="cachebash-mcp"
IMAGE_NAME="gcr.io/${PROJECT_ID}/${SERVICE_NAME}"

echo "=== CacheBash Cloud Run Deployment ==="
echo "Project: $PROJECT_ID"
echo "Region: $REGION"
echo "Service: $SERVICE_NAME"
echo ""

# Check if gcloud is installed
if ! command -v gcloud &> /dev/null; then
    echo "Error: gcloud CLI is not installed"
    echo "Install from: https://cloud.google.com/sdk/docs/install"
    exit 1
fi

# Check if logged in
if ! gcloud auth print-access-token &> /dev/null; then
    echo "Error: Not logged in to gcloud"
    echo "Run: gcloud auth login"
    exit 1
fi

# Set project
echo "Setting GCP project to $PROJECT_ID..."
gcloud config set project "$PROJECT_ID"

# Enable required APIs
echo "Enabling required APIs..."
gcloud services enable \
    cloudbuild.googleapis.com \
    run.googleapis.com \
    containerregistry.googleapis.com \
    --quiet

# Build and push the image
echo ""
echo "Building and pushing Docker image..."
gcloud builds submit --tag "$IMAGE_NAME" .

# Deploy to Cloud Run
echo ""
echo "Deploying to Cloud Run..."
gcloud run deploy "$SERVICE_NAME" \
    --image "$IMAGE_NAME" \
    --region "$REGION" \
    --platform managed \
    --allow-unauthenticated \
    --set-env-vars "NODE_ENV=production" \
    --min-instances 0 \
    --max-instances 10 \
    --memory 256Mi \
    --cpu 1 \
    --timeout 300 \
    --concurrency 80

# Get the service URL
echo ""
echo "Getting service URL..."
SERVICE_URL=$(gcloud run services describe "$SERVICE_NAME" \
    --region "$REGION" \
    --format 'value(status.url)')

echo ""
echo "=== Deployment Complete ==="
echo "Service URL: $SERVICE_URL"
echo ""

# Test health endpoint
echo "Testing health endpoint..."
HEALTH_RESPONSE=$(curl -s "${SERVICE_URL}/v1/health")
echo "Health check response: $HEALTH_RESPONSE"

if echo "$HEALTH_RESPONSE" | grep -q '"status":"ok"'; then
    echo ""
    echo "Health check PASSED!"
    echo ""
    echo "Next steps:"
    echo "1. Update DNS for mcp.cachebash.app to point to: $SERVICE_URL"
    echo "2. Configure custom domain in Cloud Run console"
    echo "3. Test with Flutter app's 'Test Connection' button"
else
    echo ""
    echo "WARNING: Health check may have failed"
    echo "Check the Cloud Run logs for details"
fi
