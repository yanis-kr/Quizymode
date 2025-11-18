# Quizymode Web Application

React web application for Quizymode, built with Vite, TypeScript, and Tailwind CSS.

## Features

- Anonymous browsing of categories and quiz items
- User authentication via AWS Cognito
- Explore mode (view Q&A with explanations)
- Quiz mode (multiple choice questions)
- Private items management
- Collections management
- Reviews and ratings
- Admin dashboard and review board

## Prerequisites

- Node.js 20+ and npm
- AWS Cognito User Pool configured
- API running (locally or remotely)

## Setup

1. **Install dependencies** (first time only):

```bash
npm install
```

2. **Configure environment variables** (required when running standalone):

   Copy `.env.example` to `.env` and fill in your AWS Cognito values:

```bash
cp .env.example .env
```

Then edit `.env` with your actual Cognito configuration:

```
VITE_API_URL=https://localhost:8080
VITE_COGNITO_USER_POOL_ID=your_user_pool_id
VITE_COGNITO_CLIENT_ID=your_client_id
VITE_COGNITO_REGION=us-east-1
```

**How to get Cognito values:**

- Check your AppHost `appsettings.json` or user secrets for `Authentication:Cognito:Authority` and `Authentication:Cognito:ClientId`
- The User Pool ID is the last part of the Authority URL (e.g., `https://cognito-idp.us-east-1.amazonaws.com/USER_POOL_ID`)
- Or get them from AWS Cognito Console

3. **Start development server**:

```bash
npm run dev
```

The app will be available at `http://localhost:7000`

**Note:** Make sure the API is running (via Aspire AppHost) before starting the Web UI, as it needs to connect to `https://localhost:8080`.

## Building for Production

```bash
npm run build
```

The production build will be in the `dist` directory, ready for deployment to AWS S3 or any static hosting service.

## Deployment to AWS S3

1. Build the application:

```bash
npm run build
```

2. Create an S3 bucket:

```bash
aws s3 mb s3://quizymode-web --region us-east-1
```

3. Configure bucket for static website hosting:

```bash
aws s3 website s3://quizymode-web --index-document index.html --error-document index.html
```

4. Upload the build:

```bash
aws s3 sync dist/ s3://quizymode-web --delete
```

5. Set bucket policy for public read access:

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Sid": "PublicReadGetObject",
      "Effect": "Allow",
      "Principal": "*",
      "Action": "s3:GetObject",
      "Resource": "arn:aws:s3:::quizymode-web/*"
    }
  ]
}
```

6. (Optional) Set up CloudFront distribution for CDN and SSL

7. Configure DNS to point to S3 bucket or CloudFront distribution

## Project Structure

```
src/
├── api/              # API client & endpoints
├── components/       # Reusable UI components
├── features/         # Feature-based modules
│   ├── auth/
│   ├── categories/
│   ├── items/
│   ├── collections/
│   ├── reviews/
│   └── admin/
├── hooks/            # Custom React hooks
├── contexts/         # React Context providers
├── types/            # TypeScript types/interfaces
└── utils/            # Utility functions
```

## Technologies

- React 19
- TypeScript
- Vite
- Tailwind CSS
- React Router
- TanStack Query
- Axios
- AWS Amplify (Cognito)
