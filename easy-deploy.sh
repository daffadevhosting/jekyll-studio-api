#!/bin/bash
# Deploy Jekyll Studio API ke AWS App Runner - Super Easy Version Broo..
# Untuk AWS CloudShell di Android

set -e

echo "🚀 Memulai deployment Jekyll Studio API..."
echo "📱 Optimized untuk CloudShell Android"

# Variables
REGION="us-east-1"
ACCOUNT_ID=$(aws sts get-caller-identity --query Account --output text 2>/dev/null || echo "unknown")
REPO_NAME="jekyll-studio-api"
SERVICE_NAME="jekyll-studio-$(date +%s)"

echo "📋 Account ID: $ACCOUNT_ID"
echo "📋 Service Name: $SERVICE_NAME"

# Step 1: Create ECR repository
echo "🔨 Creating ECR repository..."
aws ecr create-repository --repository-name $REPO_NAME --region $REGION 2>/dev/null || echo "✅ Repository sudah ada"

# Step 2: Get login token (simple version)
echo "🔐 Login ke ECR..."
aws ecr get-login-password --region $REGION | docker login --username AWS --password-stdin $ACCOUNT_ID.dkr.ecr.$REGION.amazonaws.com

# Step 3: Build image (optimized untuk CloudShell)
echo "🔨 Building Docker image..."
docker build -f Dockerfile.api -t $REPO_NAME . --no-cache

# Step 4: Tag dan Push
echo "📤 Uploading image..."
docker tag $REPO_NAME:latest $ACCOUNT_ID.dkr.ecr.$REGION.amazonaws.com/$REPO_NAME:latest
docker push $ACCOUNT_ID.dkr.ecr.$REGION.amazonaws.com/$REPO_NAME:latest

echo "✅ Image berhasil diupload!"

# Step 5: Create App Runner service dengan konfigurasi sederhana
echo "🚀 Creating App Runner service..."

aws apprunner create-service \
  --service-name "$SERVICE_NAME" \
  --source-configuration '{
    "ImageRepository": {
      "ImageIdentifier": "'$ACCOUNT_ID'.dkr.ecr.'$REGION'.amazonaws.com/'$REPO_NAME':latest",
      "ImageConfiguration": {
        "Port": "3000",
        "RuntimeEnvironmentVariables": {
          "NODE_ENV": "production",
          "PORT": "3000"
        }
      },
      "ImageRepositoryType": "ECR"
    },
    "AutoDeploymentsEnabled": false
  }' \
  --instance-configuration '{
    "Cpu": "0.25 vCPU",
    "Memory": "0.5 GB"
  }' \
  --region $REGION

echo ""
echo "🎉 DEPLOYMENT BERHASIL!"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "📋 Service Name: $SERVICE_NAME"
echo "📋 Region: $REGION"
echo ""
echo "📱 Untuk melihat URL aplikasi:"
echo "aws apprunner describe-service --service-arn \$(aws apprunner list-services --query \"ServiceSummaryList[?ServiceName=='$SERVICE_NAME'].ServiceArn\" --output text)"
echo ""
echo "⏰ Tunggu 5-10 menit sampai service aktif"
echo "🌐 Cek AWS Console > App Runner untuk URL lengkap"