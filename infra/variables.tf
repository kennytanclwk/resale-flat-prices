variable "aws_region" {
  description = "AWS region containing the entire deployment."
  type        = string
  default     = "ap-southeast-1"
}

variable "project_name" {
  description = "Short resource-name prefix; must be unique within the account/region."
  type        = string
  default     = "hdb-lens"

  validation {
    condition     = can(regex("^[a-z][a-z0-9-]{2,19}$", var.project_name))
    error_message = "Use 3–20 lowercase letters, digits, or hyphens, starting with a letter."
  }
}

variable "image_tag" {
  description = "Immutable image tag that has been pushed to the generated ECR repository."
  type        = string
  default     = "assessment-v1"

  validation {
    condition     = can(regex("^[A-Za-z0-9_][A-Za-z0-9_.-]{0,127}$", var.image_tag))
    error_message = "Provide a valid Docker image tag."
  }
}

variable "desired_count" {
  description = "Running task count. Use 0 while bootstrapping ECR; 2 adds task redundancy."
  type        = number
  default     = 1

  validation {
    condition     = var.desired_count >= 0 && var.desired_count <= 10 && floor(var.desired_count) == var.desired_count
    error_message = "desired_count must be an integer between 0 and 10."
  }
}

variable "cpu" {
  description = "Fargate CPU units: 256, 512, or 1024."
  type        = number
  default     = 512

  validation {
    condition     = contains([256, 512, 1024], var.cpu)
    error_message = "cpu must be 256, 512, or 1024."
  }
}

variable "memory" {
  description = "Task memory in MiB. Validated against the selected Fargate CPU allocation."
  type        = number
  default     = 2048

  validation {
    condition = (
      (var.cpu == 256 && contains([512, 1024, 2048], var.memory)) ||
      (var.cpu == 512 && contains([1024, 2048, 3072, 4096], var.memory)) ||
      (var.cpu == 1024 && contains([2048, 3072, 4096, 5120, 6144, 7168, 8192], var.memory))
    )
    error_message = "memory must be a supported Fargate CPU/memory combination."
  }
}

variable "certificate_arn" {
  description = "Optional validated ACM certificate in aws_region; enables HTTPS and HTTP redirection."
  type        = string
  default     = null

  validation {
    condition     = var.certificate_arn == null ? true : can(regex("^arn:aws:acm:[a-z0-9-]+:[0-9]{12}:certificate/", var.certificate_arn))
    error_message = "certificate_arn must be null or an ACM certificate ARN."
  }
}

variable "domain_name" {
  description = "Domain covered by certificate_arn. Configure its DNS alias/CNAME to the ALB."
  type        = string
  default     = null

  validation {
    condition     = (var.domain_name == null) == (var.certificate_arn == null)
    error_message = "Set domain_name and certificate_arn together, or leave both null."
  }
}

variable "allowed_ingress_cidrs" {
  description = "IPv4 ranges allowed to reach the ALB; narrow to reviewer IPs when possible."
  type        = set(string)
  default     = ["0.0.0.0/0"]

  validation {
    condition     = length(var.allowed_ingress_cidrs) > 0 && alltrue([for cidr in var.allowed_ingress_cidrs : can(cidrnetmask(cidr))])
    error_message = "Provide at least one valid IPv4 CIDR."
  }
}
