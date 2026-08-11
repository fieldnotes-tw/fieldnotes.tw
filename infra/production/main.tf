module "stack" {
  source = "../modules/stack"

  environment       = "production"
  aws_region        = "ap-east-2"
  vpc_cidr          = "10.30.0.0/16"
  instance_type     = "t4g.micro"
  db_instance_class = "db.t4g.micro"
}

output "cloudfront_domain_name" {
  value = module.stack.cloudfront_domain_name
}

output "cloudfront_distribution_id" {
  value = module.stack.cloudfront_distribution_id
}

output "frontend_bucket" {
  value = module.stack.frontend_bucket
}

output "ecr_repository_url" {
  value = module.stack.ecr_repository_url
}

output "api_instance_id" {
  value = module.stack.api_instance_id
}

output "api_public_ip" {
  value = module.stack.api_public_ip
}

output "db_secret_arn" {
  value = module.stack.db_secret_arn
}

output "app_secret_arn" {
  value = module.stack.app_secret_arn
}

output "admin_username" {
  value = module.stack.admin_username
}
