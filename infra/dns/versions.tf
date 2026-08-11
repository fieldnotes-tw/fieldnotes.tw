terraform {
  required_version = ">= 1.6.0"

  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 5.100"
    }
  }

  # Bucket name (contains account id) is supplied via gitignored backend.hcl
  backend "s3" {
    key            = "dns/terraform.tfstate"
    region         = "ap-east-2"
    dynamodb_table = "fieldnotes-tw-tf-locks"
    encrypt        = true
  }
}

provider "aws" {
  region = "ap-east-2"

  default_tags {
    tags = {
      Project   = "fieldnotes.tw"
      Component = "dns"
      ManagedBy = "terraform"
    }
  }
}

# CloudFront custom-domain certificates must live in us-east-1.
provider "aws" {
  alias  = "acm"
  region = "us-east-1"

  default_tags {
    tags = {
      Project   = "fieldnotes.tw"
      Component = "dns"
      ManagedBy = "terraform"
    }
  }
}
