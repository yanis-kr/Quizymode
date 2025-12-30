# PowerShell script to build and deploy Quizymode Web to S3
# Usage: .\scripts\deploy-to-s3.ps1 [-SkipBuild] [-SkipCloudFrontInvalidation]

param(
    [switch]$SkipBuild,
    [switch]$SkipCloudFrontInvalidation
)

$ErrorActionPreference = "Stop"

# Configuration
$S3Bucket = "quizymode-web"
$CloudFrontDistributionId = "EH1DS9REH8KR5"
$WebProjectPath = "src\Quizymode.Web"
$BuildOutputPath = "$WebProjectPath\dist"

Write-Host "=========================================" -ForegroundColor Cyan
Write-Host "Quizymode Web Deployment Script" -ForegroundColor Cyan
Write-Host "=========================================" -ForegroundColor Cyan
Write-Host ""

# Check if AWS CLI is installed
Write-Host "Checking AWS CLI installation..." -ForegroundColor Yellow
try {
    $awsVersion = aws --version 2>&1
    Write-Host "AWS CLI found: $awsVersion" -ForegroundColor Green
} catch {
    Write-Host "AWS CLI is not installed or not in PATH" -ForegroundColor Red
    Write-Host "Please install AWS CLI from https://aws.amazon.com/cli/" -ForegroundColor Red
    exit 1
}

# Check AWS credentials
Write-Host "Checking AWS credentials..." -ForegroundColor Yellow
try {
    $awsIdentity = aws sts get-caller-identity 2>&1
    if ($LASTEXITCODE -ne 0) {
        throw "AWS credentials not configured"
    }
    Write-Host "AWS credentials configured" -ForegroundColor Green
    Write-Host "  $awsIdentity" -ForegroundColor Gray
} catch {
    Write-Host "AWS credentials not configured or invalid" -ForegroundColor Red
    Write-Host "Please configure AWS credentials using 'aws configure' or environment variables" -ForegroundColor Red
    exit 1
}

# Build the web project
if (-not $SkipBuild) {
    Write-Host ""
    Write-Host "Building web project..." -ForegroundColor Yellow
    Push-Location $WebProjectPath
    
    try {
        # Check if node_modules exists
        if (-not (Test-Path "node_modules")) {
            Write-Host "Installing npm dependencies..." -ForegroundColor Yellow
            npm install
            if ($LASTEXITCODE -ne 0) {
                throw "npm install failed"
            }
        }
        
        # Build the project
        Write-Host "Running build..." -ForegroundColor Yellow
        npm run build
        if ($LASTEXITCODE -ne 0) {
            throw "Build failed"
        }
        
        Write-Host "Build completed successfully" -ForegroundColor Green
    } catch {
        Write-Host "Build failed: $_" -ForegroundColor Red
        Pop-Location
        exit 1
    } finally {
        Pop-Location
    }
} else {
    Write-Host ""
    Write-Host "Skipping build (using existing build output)" -ForegroundColor Yellow
}

# Verify build output exists
if (-not (Test-Path $BuildOutputPath)) {
    Write-Host "Build output directory not found: $BuildOutputPath" -ForegroundColor Red
    Write-Host "Please run the build first or remove the -SkipBuild flag" -ForegroundColor Red
    exit 1
}

Write-Host ""
Write-Host "Deploying to S3 bucket: $S3Bucket" -ForegroundColor Yellow

# Sync files to S3
try {
    # Use aws s3 sync to upload files
    # --delete removes files in S3 that don't exist locally
    # --exact-timestamps ensures files are compared by timestamp
    # --cache-control sets cache headers for static assets
    Write-Host "Syncing files to S3..." -ForegroundColor Yellow
    
    aws s3 sync $BuildOutputPath "s3://$S3Bucket/" `
        --delete `
        --exact-timestamps `
        --cache-control "public, max-age=31536000, immutable" `
        --exclude "*.html" `
        --exclude "*.json"
    
    if ($LASTEXITCODE -ne 0) {
        throw "S3 sync failed"
    }
    
    # Upload HTML files with no-cache headers
    Write-Host "Uploading HTML files..." -ForegroundColor Yellow
    aws s3 sync $BuildOutputPath "s3://$S3Bucket/" `
        --exclude "*" `
        --include "*.html" `
        --cache-control "no-cache, no-store, must-revalidate" `
        --content-type "text/html"
    
    if ($LASTEXITCODE -ne 0) {
        throw "HTML upload failed"
    }
    
    # Upload JSON files with appropriate headers
    Write-Host "Uploading JSON files..." -ForegroundColor Yellow
    aws s3 sync $BuildOutputPath "s3://$S3Bucket/" `
        --exclude "*" `
        --include "*.json" `
        --cache-control "no-cache, no-store, must-revalidate" `
        --content-type "application/json"
    
    if ($LASTEXITCODE -ne 0) {
        throw "JSON upload failed"
    }
    
    # Upload robots.txt with appropriate headers
    Write-Host "Uploading robots.txt..." -ForegroundColor Yellow
    if (Test-Path "$BuildOutputPath\robots.txt") {
        aws s3 cp "$BuildOutputPath\robots.txt" "s3://$S3Bucket/robots.txt" `
            --cache-control "no-cache, no-store, must-revalidate" `
            --content-type "text/plain"
        
        if ($LASTEXITCODE -ne 0) {
            throw "robots.txt upload failed"
        }
    }
    
    # Upload sitemap.xml with appropriate headers
    Write-Host "Uploading sitemap.xml..." -ForegroundColor Yellow
    if (Test-Path "$BuildOutputPath\sitemap.xml") {
        aws s3 cp "$BuildOutputPath\sitemap.xml" "s3://$S3Bucket/sitemap.xml" `
            --cache-control "no-cache, no-store, must-revalidate" `
            --content-type "application/xml"
        
        if ($LASTEXITCODE -ne 0) {
            throw "sitemap.xml upload failed"
        }
    }
    
    Write-Host "Files deployed successfully to S3" -ForegroundColor Green
} catch {
    Write-Host "Deployment failed: $_" -ForegroundColor Red
    exit 1
}

# Invalidate CloudFront cache
if (-not $SkipCloudFrontInvalidation) {
    Write-Host ""
    Write-Host "Invalidating CloudFront cache..." -ForegroundColor Yellow
    try {
        $invalidationId = aws cloudfront create-invalidation `
            --distribution-id $CloudFrontDistributionId `
            --paths "/*" `
            --query "Invalidation.Id" `
            --output text
        
        if ($LASTEXITCODE -ne 0) {
            throw "CloudFront invalidation failed"
        }
        
        Write-Host "CloudFront cache invalidation created: $invalidationId" -ForegroundColor Green
        Write-Host "  Note: Invalidation may take a few minutes to complete" -ForegroundColor Gray
    } catch {
        Write-Host "CloudFront invalidation failed: $_" -ForegroundColor Red
        Write-Host "  Deployment to S3 succeeded, but cache may not be cleared" -ForegroundColor Yellow
    }
} else {
    Write-Host ""
    Write-Host "Skipping CloudFront cache invalidation" -ForegroundColor Yellow
}

Write-Host ""
Write-Host "=========================================" -ForegroundColor Cyan
Write-Host "Deployment completed successfully!" -ForegroundColor Green
Write-Host "=========================================" -ForegroundColor Cyan
Write-Host ""
Write-Host "S3 Bucket: $S3Bucket" -ForegroundColor Gray
Write-Host "CloudFront Distribution: $CloudFrontDistributionId" -ForegroundColor Gray
Write-Host ""
