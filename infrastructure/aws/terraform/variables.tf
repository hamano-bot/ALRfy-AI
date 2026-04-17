variable "aws_region" {
  description = "AWS region for deployment resources"
  type        = string
}

variable "project_name" {
  description = "Project identifier used for resource names"
  type        = string
}

variable "environment" {
  description = "Deployment environment (dev/stg/prod)"
  type        = string
}
