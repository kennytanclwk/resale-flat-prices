output "application_url" {
  description = "Load balancer URL. With HTTPS, configure DNS matching the ACM certificate."
  value       = var.certificate_arn == null ? "http://${aws_lb.app.dns_name}" : "https://${var.domain_name}"
}

output "alb_dns_name" {
  description = "Create a DNS alias/CNAME to this name when supplying an ACM certificate."
  value       = aws_lb.app.dns_name
}

output "ecr_repository_url" {
  description = "Push the built application image here before setting desired_count above zero."
  value       = aws_ecr_repository.app.repository_url
}

output "ecs_cluster_name" {
  value = aws_ecs_cluster.app.name
}

output "ecs_service_name" {
  value = aws_ecs_service.app.name
}

output "log_group_name" {
  value = aws_cloudwatch_log_group.app.name
}
