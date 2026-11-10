# AWS deployment design

Deployment is optional for this assessment. These files define infrastructure; they do not deploy anything during local application setup or CI.

## Resources and decisions

- One VPC, an internet gateway, and two public subnets in separate availability zones.
- An internet-facing Application Load Balancer forwarding to port 3001 on an ECS Fargate service. `/api/health` checks that the process has loaded its data. The frontend and API share one origin.
- An immutable-tag ECR repository, image scanning on push, and expiry of untagged images after seven days.
- Separate IAM roles: the application role has no AWS permissions; the execution role can pull from this ECR repository and write to this application's log group. ECR authorization requires a wildcard resource.
- CloudWatch stdout/stderr logging with 14-day retention and ECS deployment rollback on unhealthy tasks.
- The container runs as UID 1000, drops Linux capabilities, and has a read-only root filesystem. Its data snapshot is baked into the image.

The task receives a public IP to pull images and send logs without NAT gateways. Its security group accepts application traffic only from the ALB security group; direct internet ingress is blocked. Outbound TCP 443 supports ECR and CloudWatch. This is a cost-conscious assessment configuration. A production environment could place tasks in private subnets with NAT or the required VPC endpoints. [AWS documents the public-IP requirement for Fargate image pulls](https://docs.aws.amazon.com/AmazonECS/latest/developerguide/fargate-task-networking.html).

Default sizing is one task with 0.5 vCPU and 2 GiB memory. Two subnets make the ALB available across zones; **one task does not provide application redundancy**. Set `desired_count = 2` for task redundancy, and load-test before choosing CPU, memory, or autoscaling thresholds. CPU/memory combinations are validated by Terraform.

HTTP is enabled by default so a reviewer can deploy without owning a domain. For an internet-facing production deployment, supply `certificate_arn` and `domain_name` together, and configure DNS to the `alb_dns_name` output. The certificate must be validated in the same AWS region and cover that domain. HTTPS then terminates at the ALB, and HTTP redirects to HTTPS. Route 53 records and ACM certificate issuance are intentionally external inputs so the code does not assume control of a DNS zone.

## Prerequisites and validation

Use Terraform 1.9 or later (below 2.0), Docker, AWS CLI, and AWS credentials authorized to create these resources. The AWS provider is constrained to major version 6; `.terraform.lock.hcl` records the validated selection. CI validates configuration without AWS credentials and never runs `plan` or `apply`.

```sh
cd infra
terraform fmt -check -recursive
terraform init -backend=false
terraform validate
```

No AWS resources are needed for those checks. Planning and applying require AWS credentials and may incur costs. This repository leaves Terraform's backend local for easy assessment; state files and local `terraform.tfvars` are ignored. For shared operation, configure an encrypted, access-controlled remote state backend with locking before deployment.

## Optional deployment

The following is an operator-run example, not part of the local application workflow. Run from a POSIX shell; use equivalent variable syntax in PowerShell. Change the immutable image tag for each release.

First create the infrastructure with zero tasks so that ECR exists before the first image is pushed:

```sh
cd infra
cp terraform.tfvars.example terraform.tfvars
terraform init
terraform plan -var='desired_count=0' -out=bootstrap.tfplan
terraform apply bootstrap.tfplan
REPOSITORY=$(terraform output -raw ecr_repository_url)
REGISTRY=${REPOSITORY%%/*}
TAG=assessment-v1
aws ecr get-login-password --region ap-southeast-1 | docker login --username AWS --password-stdin "$REGISTRY"
cd ..
docker build --platform linux/amd64 -t "$REPOSITORY:$TAG" .
docker push "$REPOSITORY:$TAG"
cd infra
terraform plan -var="image_tag=$TAG" -var='desired_count=1' -out=deploy.tfplan
terraform apply deploy.tfplan
aws ecs wait services-stable --region ap-southeast-1 --cluster "$(terraform output -raw ecs_cluster_name)" --services "$(terraform output -raw ecs_service_name)"
terraform output application_url
```

Adjust the region in both AWS CLI commands if changing `aws_region`. Bootstrap still creates a billable ALB, even with zero tasks. A brand-new AWS account must permit creation of the ECS service-linked role. The deployment principal also needs permission to pass the two task roles.

To release updated data, run `pnpm data:refresh` locally, review the CSV and provenance metadata, restart and verify locally, rebuild the container under a new immutable tag, and apply the new tag. Running tasks do not mutate or refresh their embedded snapshot. Deployment rollback returns to the previous image and its matching data.

For a local container check from the repository root:

```sh
docker build -t hdb-lens:local .
docker run --rm --read-only --cap-drop=ALL -p 3001:3001 hdb-lens:local
```

Then open `http://localhost:3001` and check `http://localhost:3001/api/health`. The Docker build uses pnpm 11.25.0 and Node 24, installs from the lockfile, builds the Vue and TypeScript outputs, and removes development dependencies.

## Operation, cost, and teardown

Use ECS service events for failed deployments, target group health for routing failures, and the `log_group_name` output for process logs. The ECS circuit breaker rolls back failed deployments after an existing successful deployment is available. There are no alert destinations in this assessment: add alarms and notifications for ALB errors, unhealthy targets, and sustained task memory/CPU before operating a production service.

Billable components include the ALB, its capacity units, Fargate CPU/memory, public IPv4 addresses, CloudWatch logs, ECR storage, and data transfer. No fixed price estimate is embedded because region, usage, and AWS pricing vary. No NAT gateway, database, or scheduled ingestion service is provisioned.

To remove the deployment, review `terraform plan -destroy` and run `terraform destroy` when appropriate. The ECR repository intentionally has `force_delete = false`; it cannot be destroyed while it contains images. Remove images you intend to discard first, then retry destruction. Terraform state should be retained until teardown is complete.

The [ECS service Terraform resource](https://registry.terraform.io/providers/hashicorp/aws/latest/docs/resources/ecs_service) documents deployment circuit breakers, network configuration, and public-IP assignment used here.
