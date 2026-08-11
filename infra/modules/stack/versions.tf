terraform {
  required_version = ">= 1.6.0"

  required_providers {
    aws = {
      source                = "hashicorp/aws"
      version               = "~> 5.100"
      configuration_aliases = [aws.ses]
    }
    random = {
      source  = "hashicorp/random"
      version = "~> 3.7"
    }
  }
}
