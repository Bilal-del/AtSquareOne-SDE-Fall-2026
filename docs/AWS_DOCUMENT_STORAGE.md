# Milestone 6: private document bucket setup

SquareOne document uploads require a new private S3 bucket in `us-east-2`. Do not reuse or modify `squareone-week4-static-demo-2026`.

## Owner-run setup

Choose a globally unique bucket name, then run:

```bash
export SQUAREONE_DOCUMENT_BUCKET="squareone-documents-your-unique-suffix"
aws s3api create-bucket --bucket "$SQUAREONE_DOCUMENT_BUCKET" --region us-east-2 --create-bucket-configuration LocationConstraint=us-east-2
aws s3api put-public-access-block --bucket "$SQUAREONE_DOCUMENT_BUCKET" --public-access-block-configuration BlockPublicAcls=true,IgnorePublicAcls=true,BlockPublicPolicy=true,RestrictPublicBuckets=true
aws s3api put-bucket-ownership-controls --bucket "$SQUAREONE_DOCUMENT_BUCKET" --ownership-controls 'Rules=[{ObjectOwnership=BucketOwnerEnforced}]'
aws s3api put-bucket-encryption --bucket "$SQUAREONE_DOCUMENT_BUCKET" --server-side-encryption-configuration 'Rules=[{ApplyServerSideEncryptionByDefault={SSEAlgorithm=AES256},BucketKeyEnabled=true}]'
```

Attach this least-privilege policy to the IAM user or role used by Django, substituting the bucket name:

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Sid": "SquareOneDocumentObjects",
      "Effect": "Allow",
      "Action": ["s3:GetObject", "s3:PutObject", "s3:DeleteObject"],
      "Resource": "arn:aws:s3:::squareone-documents-your-unique-suffix/users/*"
    },
    {
      "Sid": "SquareOneDocumentBucketLocation",
      "Effect": "Allow",
      "Action": "s3:GetBucketLocation",
      "Resource": "arn:aws:s3:::squareone-documents-your-unique-suffix"
    }
  ]
}
```

Copy `.env.example` to `.env`, set `AWS_DOCUMENT_BUCKET`, and supply credentials using the standard AWS credential chain. For local Docker Compose, short-lived `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`, and (when applicable) `AWS_SESSION_TOKEN` values can be placed in the uncommitted `.env` file. Never use `VITE_` variables for credentials.

## Verification

```bash
aws sts get-caller-identity
aws s3api get-public-access-block --bucket "$SQUAREONE_DOCUMENT_BUCKET"
aws s3api get-bucket-ownership-controls --bucket "$SQUAREONE_DOCUMENT_BUCKET"
aws s3api get-bucket-encryption --bucket "$SQUAREONE_DOCUMENT_BUCKET"
aws s3api head-bucket --bucket "$SQUAREONE_DOCUMENT_BUCKET"
docker compose build backend
docker compose up -d
docker compose exec backend python manage.py migrate
docker compose exec backend python manage.py test api.test_documents
```

## Consistency strategy

Uploads write the validated object first and then metadata. A metadata-write failure triggers a compensating S3 delete. Library deletion deletes the S3 object first; if S3 reports an error, database metadata and all application associations are retained and the API reports failure. Only after S3 confirms deletion does Django cascade-delete metadata and associations. Detaching or deleting an application only removes association rows and never touches document objects.

Automated tests mock every S3 operation. A real upload, preview/download, and delete must be checked after the owner provisions the bucket and credentials.
