# AWS deployment scaffold (minimal)

This directory is a starting point for deploying `project-manager/apps/web` on AWS.

## Suggested baseline

- Runtime: ECS Fargate (or App Runner)
- Container registry: ECR
- TLS + domain: ALB + ACM + Route 53
- CI/CD: GitHub Actions -> ECR push -> ECS deploy
- Secrets: AWS Secrets Manager / SSM Parameter Store

## Structure

- `terraform/` - minimal Terraform entry files
- `environments/` - per-environment tfvars examples

## Next steps

1. Choose target runtime (ECS Fargate or App Runner).
2. Fill Terraform resources in `terraform/main.tf`.
3. Add `dev.tfvars` / `prod.tfvars` from examples.
4. Wire GitHub Actions deployment workflow for selected runtime.
